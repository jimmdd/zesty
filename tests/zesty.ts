import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { createInitializeMint2Instruction, createInitializeMintInstruction, getMinimumBalanceForRentExemptMint, getMint, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import {
   LightSystemProgram,
   Rpc,
   accountCompressionProgram,
   confirmTx,
   createRpc,
   getAccountCompressionAuthority,
   getRegisteredProgramPda,
   noopProgram,
} from "@lightprotocol/stateless.js";
import { approveAndMintTo, createMint, mintTo, transfer, CompressedTokenProgram, createTokenPool, getTokenPoolInfos, CPI_AUTHORITY_SEED } from "@lightprotocol/compressed-token";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { Zesty } from "../target/types/zesty";
import { getCompressionMintIx } from "./lightCompressionProgram";
import { min } from "bn.js";
import { SPL_NOOP_PROGRAM_TAG } from "@lightprotocol/zk-compression-cli";
import { assert } from "chai";


describe("mint compressed token", () => {
   // use fixed keypairs for testing 
   const payer = Keypair.fromSecretKey(Uint8Array.from([47, 190, 85, 201, 226, 79, 55, 28, 180, 94, 99, 30, 188, 149, 1, 242, 27, 248, 119, 43, 164, 204, 142, 19, 93, 112, 30, 100, 65, 112, 78, 51, 245, 89, 172, 170, 173, 163, 188, 63, 93, 35, 79, 252, 94, 183, 78, 17, 156, 136, 89, 32, 70, 57, 124, 15, 130, 161, 23, 103, 60, 68, 179, 207]));
   console.log("Payer public key", payer.publicKey.toBase58());
   const tokenRecipient = Keypair.fromSecretKey(Uint8Array.from([173, 197, 50, 131, 39, 29, 39, 250, 159, 196, 73, 134, 58, 29, 223, 8, 28, 2, 99, 49, 210, 52, 247, 89, 99, 21, 50, 36, 230, 87, 154, 166, 178, 174, 70, 242, 176, 126, 88, 41, 159, 168, 242, 142, 158, 98, 184, 241, 75, 202, 115, 21, 146, 148, 43, 49, 14, 82, 252, 71, 158, 41, 54, 89]));
   console.log("Recipient public key", tokenRecipient.publicKey.toBase58());
   const mint = Keypair.fromSecretKey(Uint8Array.from([202, 211, 31, 147, 122, 247, 234, 6, 79, 147, 27, 72, 49, 8, 137, 128, 250, 27, 51, 16, 187, 218, 50, 164, 183, 232, 34, 130, 139, 1, 116, 94, 75, 181, 213, 91, 43, 5, 77, 50, 214, 89, 19, 83, 114, 142, 143, 240, 253, 174, 22, 3, 157, 147, 40, 224, 177, 24, 171, 197, 197, 102, 244, 137]));
   console.log("Mint public key", mint.publicKey.toBase58());
   // Configure the client to use the local cluster.
   const provider = new anchor.AnchorProvider(
      new Connection("http://localhost:8899"),
      new anchor.Wallet(payer),
      { preflightCommitment: "processed" }
   );
   anchor.setProvider(provider);
   const program = anchor.workspace.Zesty as Program<Zesty>;
   const connection: Rpc = createRpc();
   // find the mint authority PDA
   const [mintAuthorityPda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from("mint_auth"), payer.publicKey.toBuffer()],
      program.programId
   );

   it("create new mint with pda auth", async () => {
      // Airdrop SOL to payer
      const sig = await confirmTx(
         connection,
         await connection.requestAirdrop(payer.publicKey, 10e9)
      );
      console.log("Payer Airdrop confirmed", sig);
      console.log("Payer Airdrop done");

      // get the minimum balance for rent exempt mint
      const lamports = await getMinimumBalanceForRentExemptMint(connection);

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
      await confirmTx(connection, await connection.sendTransaction(transaction, [payer, mint], { skipPreflight: false, preflightCommitment: "confirmed" }));
      console.log("Your transaction signature", tx);
      console.log("Mint created:", mint.publicKey.toBase58());
      console.log("Mint authority (PDA):", mintAuthorityPda.toBase58());

      const mintInfo = await getMint(connection, mint.publicKey, undefined, TOKEN_2022_PROGRAM_ID);
      assert.equal(mintInfo.mintAuthority.toBase58(), mintAuthorityPda.toBase58())

      // create token pool
      const tokenPool = await createTokenPool(
         connection,
         payer,
         mint.publicKey,
         undefined,
         TOKEN_2022_PROGRAM_ID
      );
      console.log("Token pool created:", tokenPool);
   })

   it("mint compressed token to recipent", async () => {
      // set up
      const sig = await confirmTx(
         connection,
         await connection.requestAirdrop(tokenRecipient.publicKey, 10e9)
      );
      console.log("recipent Airdrop confirmed", sig);
      console.log("recipent Airdrop done");
      const transferAmount = 1e9;
      const tokenRate = 1000;

      // get required info from light protocol
      // get token pool info
      const tokenPoolInfos = await getTokenPoolInfos(connection, mint.publicKey);
      console.log("token pool infos", tokenPoolInfos);
      // get tree info
      const stateTreeInfos = await connection.getStateTreeInfos();
      console.log("state tree infos", stateTreeInfos);
      // get token cpi auth pda
      const registeredProgramPda = getRegisteredProgramPda()
      console.log("registered program pda", registeredProgramPda.toBase58());
      const [cpiAuthorityPda] = PublicKey.findProgramAddressSync(
         [Buffer.from(CPI_AUTHORITY_SEED)],
         CompressedTokenProgram.programId
      );

      console.log("cpi authority pda", cpiAuthorityPda.toBase58());
      const accountCompressionAuthorityPda = getAccountCompressionAuthority()
      console.log("account compression authority pda", accountCompressionAuthorityPda.toBase58());
      // build the instruction
      const ix = await program.methods.mintCompressedTokens(new anchor.BN(transferAmount), new anchor.BN(tokenRate))
         .accounts({
            mint: mint.publicKey,
            tokenPoolPda: tokenPoolInfos[0].tokenPoolPda,
            compressedTokenCpiAuthorityPda: cpiAuthorityPda,
            accountCompressionAuthorityPda: accountCompressionAuthorityPda,
            registeredProgramPda: registeredProgramPda,
            noopProgram: noopProgram,
            mintCreator: payer.publicKey,
            mintAuthority: mintAuthorityPda,
            stateTree: stateTreeInfos[0].tree,
            recipient: tokenRecipient.publicKey,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
            lightSystemProgram: LightSystemProgram.programId,
            accountCompressionProgram: accountCompressionProgram,
            compressedTokenProgram: CompressedTokenProgram.programId,
            solPoolPda: null,
         }).instruction();
      const transaction = new Transaction().add(ix);
      console.log("transaction", transaction);
      const sig2 = await confirmTx(connection, await connection.sendTransaction(transaction, [tokenRecipient], { skipPreflight: false, preflightCommitment: "confirmed" }));
      console.log("Minted compressed token transaction signature", sig2);

      // get the mint info to verify the mint was successful
      let mintAccount = await getMint(
         connection,
         mint.publicKey,
         undefined,
         TOKEN_2022_PROGRAM_ID
      );
      console.log("Mint info after mint", mintAccount);
   })
})