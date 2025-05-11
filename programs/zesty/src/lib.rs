use anchor_lang::prelude::*;

declare_id!("EFGd7a5WYMCwPb2ayfKq6JeavNmaicuMTFfLif8VeU3M");
use instructions::*;
pub mod instructions;

#[program]
pub mod zesty {
    use super::*;

    pub fn mint_compressed_tokens<'info>(
        ctx: Context<MintCompressedTokens>,
        transfer_amount: u64, // transfer amount in lamports from solana pay transaction
        token_rate: u64,      // tokens per lamport (e.g., 10000 = 100 tokens per 0.01 SOL)
    ) -> Result<()> {
        instructions::mint_compressed_tokens(ctx, transfer_amount, token_rate)
    }

    pub fn create_new_loyalty_mint<'info>(ctx: Context<CreateMint2022>) -> Result<()> {
        instructions::create_mint_with_pda(ctx)
    }
}
