use account_compression::program::AccountCompression;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
};
use anchor_lang::AnchorSerialize;

use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::Mint;
// use light_compressed_token::cpi::mint_to;
// use light_compressed_token::process_transfer::get_cpi_authority_pda;
use light_compressed_token::program::LightCompressedToken;
use light_system_program::program::LightSystemProgram;

#[derive(Accounts)]
pub struct EmitEvent {}

#[event]
pub struct CustomEvent {
    pub message: String,
}

// Mint zk-compressed tokens to a customer based on Solana Pay transfer amount
pub fn mint_compressed_tokens(
    ctx: Context<MintCompressedTokens>,
    transfer_amount: u64, // Lamports (SOL * 10^9)
    token_rate: u64,      // Tokens per lamport (e.g., 10000 = 100 tokens per 0.01 SOL)
) -> Result<()> {
    // Calculate tokens to mint
    let tokens_to_mint = transfer_amount
        .checked_mul(token_rate)
        .ok_or(ZestyMintError::MathOverflow)?;
    require!(tokens_to_mint > 0, ZestyMintError::ZeroAmount);
    emit!(CustomEvent {
        message: tokens_to_mint.to_string()
    });

    let recipient = ctx.accounts.recipient.key();
    let amounts = vec![tokens_to_mint];
    let recipients = vec![recipient];

    let signer_seeds = &[
        b"mint_auth",
        ctx.accounts.mint_creator.key.as_ref(),
        &[ctx.bumps.mint_authority],
    ];
    // manual cpi call
    let mut data: Vec<u8> = vec![241, 34, 48, 186, 37, 179, 123, 192];
    data.extend(recipients.try_to_vec()?);
    data.extend(amounts.try_to_vec()?);
    data.extend(Option::<u64>::None.try_to_vec()?); // no lamports
    let accounts = light_compressed_token::accounts::MintToInstruction {
        fee_payer: ctx.accounts.recipient.key(),
        authority: ctx.accounts.mint_authority.key(),
        cpi_authority_pda: ctx.accounts.compressed_token_cpi_authority_pda.key(),
        mint: ctx.accounts.mint.key(),
        token_pool_pda: ctx.accounts.token_pool_pda.key(),
        token_program: ctx.accounts.token_program.key(),
        light_system_program: ctx.accounts.light_system_program.key(),
        registered_program_pda: ctx.accounts.registered_program_pda.key(),
        noop_program: ctx.accounts.noop_program.key(),
        account_compression_authority: ctx.accounts.account_compression_authority_pda.key(),
        account_compression_program: ctx.accounts.account_compression_program.key(),
        merkle_tree: ctx.accounts.state_tree.key(),
        self_program: ctx.accounts.compressed_token_program.key(),
        system_program: ctx.accounts.system_program.key(),
        sol_pool_pda: None,
    };
    let ix = Instruction {
        program_id: light_compressed_token::ID,
        accounts: accounts.to_account_metas(Some(true)),
        data: data,
    };

    invoke_signed(
        &ix,
        &[
            ctx.accounts.recipient.to_account_info(),
            ctx.accounts.mint_authority.to_account_info(),
            ctx.accounts
                .compressed_token_cpi_authority_pda
                .to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.token_pool_pda.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.light_system_program.to_account_info(),
            ctx.accounts.registered_program_pda.to_account_info(),
            ctx.accounts.noop_program.to_account_info(),
            ctx.accounts
                .account_compression_authority_pda
                .to_account_info(),
            ctx.accounts.account_compression_program.to_account_info(),
            ctx.accounts.state_tree.to_account_info(),
            ctx.accounts.compressed_token_program.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
        &[signer_seeds],
    )?;

    Ok(())
}

#[derive(Accounts)]
#[instruction(transfer_amount: u64, token_rate: u64)]
pub struct MintCompressedTokens<'info> {
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,
    /// CHECK: Validated by compressed token program
    #[account(mut)]
    pub token_pool_pda: AccountInfo<'info>,
    /// CHECK: Validated by compressed token program
    #[account(mut)]
    pub compressed_token_cpi_authority_pda: AccountInfo<'info>,
    #[account(mut)]
    /// CHECK: Validated by compressed token program
    pub account_compression_authority_pda: AccountInfo<'info>,
    #[account(mut)]
    /// CHECK: Validated by compressed token program
    pub registered_program_pda: AccountInfo<'info>,
    /// CHECK: Validated by compressed token program
    pub noop_program: AccountInfo<'info>,
    /// CHECK: only use for derive mint auth pda
    pub mint_creator: AccountInfo<'info>,
    #[account(
        mut,
        seeds = [b"mint_auth", mint_creator.key().as_ref()],
        bump
    )]
    pub mint_authority: AccountInfo<'info>,
    #[account(mut)]
    pub state_tree: AccountInfo<'info>,
    #[account(mut)]
    pub recipient: Signer<'info>,
    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
    pub light_system_program: Program<'info, LightSystemProgram>,
    pub account_compression_program: Program<'info, AccountCompression>,
    pub compressed_token_program: Program<'info, LightCompressedToken>,
    /// CHECK: Validated by compressed token program
    #[account(mut)]
    pub sol_pool_pda: Option<AccountInfo<'info>>,
}

#[error_code]
pub enum ZestyMintError {
    #[msg("You are not authorized to perform this action.")]
    Unauthorized,
    #[msg("Token to mint amount over max limit.")]
    MathOverflow,
    #[msg["Token to mint amount is zero"]]
    ZeroAmount,
    #[msg["Not enough balance in burner account"]]
    NotEnoughBalance,
}
