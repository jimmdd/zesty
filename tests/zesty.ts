import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { getMinimumBalanceForRentExemptMint, getMint, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import {
   LightSystemProgram,
   Rpc,
   confirmTx,
   createRpc,
} from "@lightprotocol/stateless.js";
import { createMint, mintTo, transfer } from "@lightprotocol/compressed-token";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { Zesty } from "../target/types/zesty";


describe("mint compressed token", () => {
   const payer = Keypair.generate();
   const tokenRecipient = Keypair.generate();
   const lightCompressedTokenProgram = new PublicKey('cTokenmWW8bLPjZEBAUgYy3zKxQZW6VKi7bqNFEVv3m')
   // Configure the client to use the local cluster.
   const provider = new anchor.AnchorProvider(
      new Connection("http://localhost:8899"),
      new anchor.Wallet(payer),
      { preflightCommitment: "processed" }
   );
   anchor.setProvider(provider);
   const program = anchor.workspace.Zesty as Program<Zesty>;
   const connection2: Rpc = createRpc();
   const mint = anchor.web3.Keypair.generate();
   // find the mint authority PDA
   const [mintAuthorityPda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from("mint_auth"), payer.publicKey.toBuffer()],
      program.programId
   );

   it("Test create new mint with pda auth", async () => {
      // Airdrop SOL to payer
      const sig = await confirmTx(
         connection2,
         await connection2.requestAirdrop(payer.publicKey, 10e9)
      );
      console.log("Payer Airdrop confirmed", sig);
      console.log("Payer Airdrop done");

      // get the minimum balance for rent exempt mint
      const lamports = await getMinimumBalanceForRentExemptMint(connection2);

      console.log("mint authority PDA", mintAuthorityPda.toBase58());
      console.log("mint setup done")

      // create the mint for the merchant
      const tx = await program.methods
         .createNewLoyaltyMint()
         .accounts({
            mint: mint.publicKey,
            payer: payer.publicKey,
            mintAuthority: mintAuthorityPda,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
         })
         .signers([mint, payer])
         .preInstructions([
            anchor.web3.SystemProgram.createAccount({
               fromPubkey: provider.publicKey,
               newAccountPubkey: mint.publicKey,
               space: 82,
               lamports,
               programId: TOKEN_2022_PROGRAM_ID,
            }),
         ]).instruction();
      const transaction = new Transaction().add(tx);
      console.log("transaction", transaction);
      await confirmTx(connection2, await connection2.sendTransaction(transaction, [payer, mint], { skipPreflight: false, preflightCommitment: "confirmed" }));
      console.log("Your transaction signature", tx);
      console.log("Mint created:", mint.publicKey.toBase58());
      console.log("Mint authority (PDA):", mintAuthorityPda.toBase58());
   })

   it("Test compressed token mint", async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const sig = await confirmTx(
         connection2,
         await connection2.requestAirdrop(tokenRecipient.publicKey, 10e9)
      );
      console.log("Airdrop confirmed", sig);
      console.log("Airdrop done");
      const stateTreeInfos = await connection2.getStateTreeInfos();
      console.log("state tree infos", stateTreeInfos);
      const transferAmount = 1e9;
      const tokenRate = 1000;
      const tx = await program.methods.mintCompressedTokens(new anchor.BN(transferAmount), new anchor.BN(tokenRate))
         .accounts({
            mint: mint.publicKey,
            stateTree: stateTreeInfos[0].tree,
            recipient: tokenRecipient.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            compressedTokenProgram: lightCompressedTokenProgram,
         }).instruction();

      const transaction = new Transaction().add(tx);
      console.log("transaction", transaction);
      const sig2 = await confirmTx(connection2, await connection2.sendTransaction(transaction, [tokenRecipient], { skipPreflight: false, preflightCommitment: "confirmed" }));
      console.log("Your transaction signature", sig2);
      // get the mint info to verify the mint was successful
      let mintAccount = await getMint(
         connection2,
         mint.publicKey,
         undefined,
         TOKEN_2022_PROGRAM_ID
      );
      console.log(mintAccount);
   });

})