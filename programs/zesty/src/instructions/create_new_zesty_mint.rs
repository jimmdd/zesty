use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenInterface};

pub fn create_mint_with_pda(_ctx: Context<CreateMint2022>) -> Result<()> {
    Ok(())
}
#[derive(Accounts)]
pub struct CreateMint2022<'info> {
    #[account(
        init,
        payer = payer,
        mint::decimals = 6,
        mint::authority = mint_authority,
    )]
    pub mint: InterfaceAccount<'info, Mint>,
    /// CHECK: PDA signer
    #[account(
        seeds = [b"mint_auth", payer.key().as_ref()],
        bump,
    )]
    pub mint_authority: AccountInfo<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}
