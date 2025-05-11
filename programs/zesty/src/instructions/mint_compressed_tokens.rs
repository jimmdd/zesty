use anchor_lang::prelude::*;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{Mint, TokenInterface};
use light_compressed_token::program::LightCompressedToken;

#[derive(Accounts)]
pub struct EmitEvent {}

#[event]
pub struct CustomEvent {
    pub message: String,
}
// // Mint zk-compressed tokens to a customer based on Solana Pay transfer amount
pub fn mint_compressed_tokens(
    _ctx: Context<MintCompressedTokens>,
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

    Ok(())
}

#[derive(Accounts)]
#[instruction(transfer_amount: u64, token_rate: u64)]
pub struct MintCompressedTokens<'info> {
    mint: InterfaceAccount<'info, Mint>,
    /// CHECK: Validated by compressed token program
    // pub compressed_pda: AccountInfo<'info>,
    /// CHECK: Validated by compressed token program
    #[account(mut)]
    pub state_tree: AccountInfo<'info>,
    #[account(mut)]
    pub recipient: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token2022>,
    pub compressed_token_program: Program<'info, LightCompressedToken>,
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
