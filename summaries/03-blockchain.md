# 03 · Blockchain

Sources: [2025 L8 BFT consensus and blockchain (Christoffer)](../D7024E%20Lecture%20slides/D7024E_L8_bft_consensus-presentation.pdf) (second half), plus the consensus background in [02](02-consensus.md). Olov-era exams asked about Ethereum, PoS, DPoS, Cardano Hydra and sharding in more depth than the current slides; those parts are filled in from the Bitcoin and Ethereum documentation and are marked as such.

## Core ideas

### Why a ledger needs consensus

Electronic money must stop two things:

1. **Forged transactions**: solved with **digital signatures** (only the owner of the private key can spend). Add a **nonce** or unique input reference to stop replay.
2. **Double spending**: Alice signs "pay Bob 100" and "pay Carol 100" with the same 100. Signatures do not help; you need everyone to agree which transaction happened first. Solution: an **append-only, immutable ledger** that everyone agrees on, which is a consensus problem.

A blockchain is an immutable, distributed and decentralized ledger, and equivalently a **replicated state machine**: the chain is a globally agreed, totally ordered log of every transaction since genesis, and the current state (balances, contract storage) is the result of applying that log.

### Bitcoin transactions (UTXO model)

- A transaction has **inputs** and **outputs** and is identified by its hash.
- An input references an **unspent transaction output (UTXO)** of an earlier transaction and carries a signature proving the right to spend it.
- An output says "amount X to receiver Y". A UTXO is like a banknote with a serial number: spent once and spent whole. Change goes back to yourself as a new output. Inputs minus outputs is the **fee** to the miner.
- Coins are split and merged and you can trace every coin back to a **coinbase transaction**.

### Coinbase transaction (2019 Q3a)

- **Role:** the first transaction in every block, written by the miner. It is the only way new bitcoins are created and is the miner's reward for doing the proof-of-work.
- **Use:** pays the miner (its outputs go to an address the miner chooses). It has no real input (a null previous-output reference) and its input script field (the "coinbase data") holds the block height (BIP 34) and an extra nonce that miners vary to get more search space.
- **Value:** block subsidy + all fees of the transactions in the block. The subsidy started at 50 BTC and halves every 210 000 blocks (about four years): 3.125 BTC since April 2024. Total supply converges to 21 million.
- **Validity:** exactly one coinbase, and it must be first; its outputs may not exceed subsidy + fees; and its outputs **cannot be spent until 100 blocks later** (coinbase maturity), because the block could still be orphaned by a fork and the coins would vanish.

### Blocks and proof-of-work

- Block **header**: previous block hash, Merkle root of the transactions, timestamp, difficulty target, **nonce**. Body: coinbase + transactions.
- **Mining:** collect transactions from the gossiped pool, build a block, then brute-force the nonce until `SHA-256(SHA-256(header))` is below the target (starts with enough zeros). Nobody can predict which nonce works, so finding one proves that work was done. Verifying takes one hash.
- Difficulty adjusts every 2016 blocks so a block appears about every 10 minutes.
- **Purpose of PoW in consensus:** it limits how fast proposals can be made (giving time for blocks to propagate before the next one), makes it expensive to pretend to be many voters (Sybil resistance), and picks a random "leader" for each block in proportion to hash power. It also makes rewriting history expensive: changing an old block means redoing its work and all later blocks faster than the honest majority.
- Property used: hash functions are deterministic, fast to verify, and **pre-image resistant / unpredictable**. It is not "idempotence" that makes PoW work.

### Hash functions in Bitcoin (2021 Q2c)

1. **SHA-256d for block hashing / proof-of-work and chaining:** each header contains the hash of the previous header, so changing any block breaks every later link; PoW is a search for a header hash below the target.
2. **Merkle tree (SHA-256d) over transactions:** the Merkle root in the header commits to every transaction. Light clients verify that a transaction is in a block with a log-size Merkle proof without downloading the block. Transaction IDs are also SHA-256d hashes.
3. **Digital signatures (ECDSA on secp256k1, Schnorr since Taproot):** a key-pair "hash" that proves ownership. The spender signs a hash of the transaction with the private key; anyone verifies with the public key.
4. **Addresses: HASH160 = RIPEMD-160(SHA-256(public key))** gives a short, checksummed identifier, and hides the public key until the coins are spent.

### Consensus in Bitcoin (Nakamoto consensus)

- Forks happen: two miners find blocks at about the same time. Each chain is a possible history.
- Rule: **accept and extend the longest (most work) chain**. Proposing a block is also an implicit vote for the whole history it extends. There is no leader and no explicit voting round.
- An attacker with > 50 % of hash power can out-mine everyone: censor transactions, or fork from an earlier block and overtake the canonical chain, rewriting "confirmed" history (double spend). Below 50 % the honest majority wins; plus the economic incentive (you only earn if your block is accepted). Tolerates < 1/2 Byzantine hash power.
- Finality is **probabilistic**: a transaction 6 blocks deep (about an hour) is considered safe.

**Are PoW and PoS consensus protocols? (2025 Q2b).** The lecture's answer: not by themselves. Consensus requires safety (all correct nodes decide the same value). PoW and PoS are **Sybil-resistance and leader-selection mechanisms** that make proposing costly and decide who may propose. The consensus rule in Bitcoin is "correct nodes vote for the longest chain", and even that only gives probabilistic, eventual agreement on a prefix (forks are possible, so strict safety is not guaranteed). Ethereum's PoS is combined with an explicit BFT-style finality gadget (Casper FFG: blocks are finalized when validators with 2/3 of the stake vote for them), which together with the fork-choice rule (LMD-GHOST) *is* a consensus protocol. So: PoW/PoS + fork choice (+ finality voting) = consensus; PoW/PoS alone = a way to pick and weight voters.

### Limitations (why blockchains do not scale out)

- Fixed block size and interval means fixed throughput: Bitcoin about 7 TPS (theoretical 17), Ethereum about 15–30 TPS.
- **Everyone replicates the whole state and validates every transaction**, and everyone competes for the same next block. Adding nodes adds redundancy, not throughput: **no horizontal scalability**.
- PoW burns energy by design. Long confirmation delay. High fees under load.

### Ethereum and smart contracts

- **Account/balance model**, not UTXO. Each account has a balance, a nonce and (for contracts) code and storage.
- Ethereum is a **virtual machine (EVM)** that executes code. A smart contract is a program stored on chain; a transaction calls it. A plain payment is a special case.
- **Gas:** every instruction costs gas, paid by the sender. Bounds execution (no infinite loops; the halting problem is sidestepped) and prices resource use.
- Switched from PoW to **PoS** in September 2022 ("the Merge"). Block interval stayed 12 s, so throughput did not change, but energy use dropped by about 99.9 %.

**How smart contracts are executed and verified by many nodes (2018 Q3b, 2019 Q3b):**

1. Users sign transactions and gossip them to the mempool.
2. The block proposer (a miner under PoW; a pseudo-randomly chosen validator under PoS) picks and **orders** transactions, then executes them **one after another** in the EVM, starting from the previous block's state. Each transaction may call several contracts.
3. The resulting world state is committed with a Merkle-Patricia trie; the block header contains the **state root**, transactions root and receipts root.
4. Every other node **re-executes every transaction in the same order** from the same starting state. The EVM is deterministic, so they must get the same state root; if not, the block is invalid and rejected.
5. Consensus on the block (and thereby on the final state) comes from PoW + heaviest chain (before 2022) or PoS: a committee of validators attests to the block, fork choice follows the attestations, and after two epochs (about 12.8 min) Casper FFG finalizes it with 2/3 of the stake.

**Can multiple smart contracts run concurrently? (2020 Q3c, 2021 Q2e, 2022 Q2c)**

- In Ethereum as designed: **no**. Within a block, transactions run **sequentially** in the proposer's order. Contracts share one global state, one transaction can call many contracts, and the outcome depends on order (balances, nonces, contract storage). Sequential execution makes every node reach the same state deterministically.
- Across nodes there is no parallelism either: every node executes everything (replication, not distribution of work).
- In principle, transactions touching **disjoint state** could run in parallel. The problem is that the read/write set is only known after execution (dynamic calls). Approaches: optional access lists (EIP-2930), optimistic parallel execution with conflict detection and re-execution (Block-STM in Aptos, "parallel EVM" chains like Monad), chains that require declared read/write sets up front (Solana), and sharding (separate state per shard, cross-shard messages for interaction).
- A good answer says "no, and here is why", then "yes, conceptually, when transactions do not conflict, and here is how others do it".

### Proof-of-stake

- Validators lock up (stake) money: 32 ETH per validator in Ethereum.
- The chance to propose a block (or sit on an attesting committee) is proportional to stake, chosen pseudo-randomly (RANDAO).
- Misbehaviour (signing two blocks for the same slot, contradictory votes) is provable and punished by **slashing** (destroying stake). Honest work earns rewards.
- No mining race, so energy use is tiny.
- Problems PoS must handle: **nothing at stake** (validators could vote on every fork at no cost: fixed by slashing), **long-range attacks** (old keys rewriting ancient history: fixed by finality checkpoints and weak subjectivity), stake centralization (exchanges, staking pools).

**Delegated PoS (EOS) challenges (2020 Q3b):** token holders vote for a small set of block producers (21 in EOS), which rotate quickly (0.5 s blocks). Fast, but: heavy **centralization** (21 nodes, 15 of which can finalize); **cartels, collusion and vote buying** (producers sharing rewards with voters); **plutocracy** (whales decide); low voter turnout so a few large holders control the set; producers can **censor** or freeze accounts (EOS did, through its arbitration forum); weaker permissionless property; security now rests on a small committee.

**PoW vs PoS in Ethereum (2024 Q2d)**, be explicit about dimensions:

| Dimension | PoW | PoS |
|---|---|---|
| Throughput | ~15–30 TPS | unchanged, same 12 s slot and gas limit |
| Latency / finality | probabilistic, wait for confirmations | economic finality after ~2 epochs (~12.8 min) |
| Energy | huge (by design) | ~99.9 % less |
| Participation | requires mining hardware, tends to pool | 32 ETH and a normal machine; hundreds of thousands of validators |
| Scalability path | none built in | committees and data sharding (danksharding, see below) designed around the PoS beacon chain |
| Attack cost | > 50 % hash power, rentable, not destroyed after attack | 1/3 stake can stall finality; 2/3 could finalize a bad chain but gets slashed: **accountable safety** |
| Risks | 51 % attack, selfish mining | nothing at stake, long-range attacks, stake centralization (Lido, exchanges) |

### Scaling solutions

- **Layer 1** (change the chain): bigger blocks, shorter interval, sharding.
- **Layer 2** (build on top): state/payment channels (Lightning, Raiden), side chains, rollups (optimistic or zero-knowledge) which execute off chain and post compressed data or proofs to L1.
- **On-chain vs off-chain (2023 Q2d):** on-chain means every transaction is validated and stored by the whole network: maximum security and decentralization, slow and expensive. Off-chain means transactions are processed by a smaller group or a separate system and only the opening, closing or periodic summaries are settled on chain: fast and cheap, with extra assumptions (participants online, fraud-proof windows, data availability).

**Sharding (lecture):** split nodes into shards that each validate (and with full sharding, store) only a subset of transactions. Challenges: mapping nodes to shards (must be random so an attacker cannot concentrate in one shard); a **security–performance trade-off** (a small shard is cheaper to take over); **cross-shard validation** (Alice → Bob in another shard needs the shards to communicate). The lecture's example **ScaleGraph** goes all the way: one chain per account, each transaction recorded in both accounts' chains, and the v nodes closest (XOR, as in Kademlia) to an account form its validator group. Disjoint transactions validate in parallel and validator groups overlap.

**Ethereum sharding (2023 Q2d):** the original Eth 2.0 plan had 64 execution shard chains coordinated by the beacon chain, with validators randomly assigned to shard committees and reshuffled every epoch so attackers cannot target one shard. Ethereum moved to a **rollup-centric** roadmap: shards now provide **data availability**, not execution. **Proto-danksharding (EIP-4844, March 2024)** added "blob" transactions: about 128 KB of rollup data per blob, committed with KZG commitments and pruned after about 18 days, much cheaper than calldata. **Full danksharding** adds data availability sampling: nodes check random pieces of erasure-coded blobs instead of downloading everything.

**Cardano Hydra (2023 Q2d):** a layer-2 protocol of **isomorphic state channels** called Hydra heads. A small group of parties **commit** UTXOs from L1 into a head script, then run an off-chain ledger with the *same* rules (EUTXO and Plutus contracts) as L1. Each off-chain transaction is confirmed by a **snapshot signed by all participants** (unanimous multisignature), so confirmation is near-instant. Any participant can **close** the head with the latest snapshot; during a **contestation period** others can post a newer snapshot; then the final UTXOs **fan out** back to L1. Trade-offs: very fast and cheap for a fixed group, but every participant must stay online (anyone can halt progress, but nobody can steal), so it suits small groups, not global open use.

## Likely essay angles

- PoW schematically and its role in consensus (2018 Q3a).
- Coinbase transaction: role, use, value, validity (2019 Q3a).
- Ethereum execution and verification by many nodes (2018 Q3b, 2019 Q3b).
- Parallel execution of smart contracts (2020 Q3c, 2021 Q2e, 2022 Q2c).
- Three kinds of hash function in Bitcoin (2021 Q2c).
- Principles of PoS; DPoS challenges (2020 Q3a–b); PoS vs PoW in Ethereum (2024 Q2d).
- On-chain vs off-chain; Ethereum sharding; Cardano Hydra (2023 Q2d).
- Are PoW and PoS consensus? (2025 Q2b)

## Old exam questions

### Essay questions

- **2018 Q3a–b**, **2019 Q3a–b**, **2020 Q3a–c**, **2021 Q2c**, **2021 Q2e**, **2022 Q2c**, **2023 Q2d**, **2024 Q2d**, **2025 Q2b**: see the angles above.

### True / false / depends

| Exam | Statement (shortened) | Suggested answer |
|---|---|---|
| 2018 Q1n | Blockchains are suitable for decentralized ledgers | **True** |
| 2018 Q1o | Blockchains can represent a distributed state machine | **True** |
| 2018 Q1p | Chains with generic smart contracts can execute many contracts in parallel | **False**. Sequential within a block (Ethereum); parallel only with conflict detection or declared state access. |
| 2019 Q1i / 2020 Q1l | Many blockchains are a globally synchronized replicated log of the entire command history | **True** |
| 2019 Q1j | Blockchains scale out linearly with added nodes | **False** |
| 2020 Q1m / 2021 Q1p | Blockchains replicate all data to all nodes | **True** (full nodes; sharding and light clients are the exceptions) |
| 2022 Q1g | Idempotence of hashing makes it suitable for PoW | **False**. Pre-image resistance/unpredictability plus cheap verification. |
| 2022 Q1n | Blockchains provide scale-out transaction processing and storage | **False** |
