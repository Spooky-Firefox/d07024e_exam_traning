# Episode two. Byzantine fault tolerance and blockchains.

Welcome back. This episode covers Byzantine faults, the limits on how many faulty nodes a system can tolerate, practical Byzantine protocols like PBFT, and then blockchains: Bitcoin, proof of work, Ethereum, proof of stake, and scaling with sharding and layer two solutions. Blockchain questions have appeared on every exam since twenty eighteen, so this one is worth listening to twice.

## Failure models

In the crash fault model, a node either works correctly or stops completely. That is the model behind Paxos and Raft. It is optimistic. What about bugs, or attackers?

A Byzantine node can do anything. It can crash, delay its answers, stay silent, send duplicates, send garbage, or send carefully crafted lies, including different messages to different nodes. The Byzantine model is a superset of the crash model.

The lecture warns about misleading synonyms. People say Byzantine, malicious, dishonest or traitor on one side, and correct, honest or loyal on the other. But Byzantine does not have to mean malicious. If an honest node crashes, it is still faulty. What matters is not why a node misbehaves, but what it is able to do. This is exactly what the twenty twenty five exam asked: "one reason Byzantine consensus is difficult is that there can be dishonest nodes, but some honest nodes could also crash." The point is that both count as faulty, and the protocol cannot tell whether silence means a crash, a slow network, or a traitor.

## The Byzantine generals

The classic story: several generals surround a city and must all agree to attack or retreat. Loyal generals repeat what they heard. Traitors lie, and can tell different generals different things. Two safety conditions must hold: all loyal generals decide on the same plan, and a small number of traitors cannot make the loyal generals adopt a bad plan.

With plain pairwise messages, where only the receiver sees each message, there is no solution if one third or more of the generals are traitors. Put differently, with m traitors you need at least three m plus one generals. For example, with three generals and one traitor, a loyal lieutenant receives "attack" from one source and "retreat" from another, and has no way to know who is lying.

Signed messages change the picture. If a loyal general's signature cannot be forged and anyone can verify it, a traitor cannot claim someone else said something they did not. Then lieutenants can prove that a commander sent conflicting orders.

## Why one third? The threshold argument

This argument from the lecture is worth being able to reproduce.

Raft needs a majority, more than half the votes, and tolerates f crashed nodes out of two f plus one. Can we just tweak Raft to tolerate fewer than half Byzantine nodes? No. Imagine a Byzantine leader. It proposes value A to one correct node and value B to another. The Byzantine nodes vote for both. Each value can reach a majority, and two correct nodes decide different values. Safety is broken by a single Byzantine leader. Even a non-leader breaks it: during a network partition that splits the correct nodes into two halves, one Byzantine node that can talk to both halves votes in both, giving each half its majority.

What if we require all n nodes to agree? Then Byzantine nodes can block progress forever just by staying silent. We keep safety but lose liveness. The quorum must be reachable with only the n minus f correct nodes.

So try f less than one third of n, with n equals three f plus one, and require more than two thirds of the votes, which is two f plus one votes. Correct nodes vote only once; Byzantine nodes can vote twice, once for each conflicting value. Count them as two f Byzantine voters, giving four f plus one votes in total. Two conflicting quorums would need two times two f plus one, which is four f plus two votes. That is more than exist. So two conflicting decisions are impossible. And two f plus one votes can always be collected from the correct nodes alone, so liveness is possible too.

The summary table to memorize:
Crash fault tolerance, like Raft: tolerates fewer than one half faulty, needs a majority quorum, n at least two f plus one.
Byzantine fault tolerance in a partially synchronous network: tolerates fewer than one third, needs more than two thirds, n at least three f plus one.
Byzantine fault tolerance in a synchronous network with digital signatures: tolerates fewer than one half. Synchrony means a known upper bound on message delay, so silence for long enough proves a crash and partitions are ruled out. Real networks rarely give you that guarantee.

Most practical protocols assume partial synchrony: safety holds no matter how slow messages are, and liveness kicks in after some unknown time when the network stabilizes.

## PBFT and its successors

PBFT, Practical Byzantine Fault Tolerance, tolerates fewer than one third Byzantine nodes and requires more than two thirds agreement. It looks a bit like Raft. Time is divided into views, like Raft terms. Each view has a stable primary, the leader. If the primary fails, a view change happens. The differences: primaries are chosen deterministically, round robin, with no voting, and votes are broadcast to everyone rather than sent only to the leader.

A PBFT decision has three phases. Pre-prepare: the primary proposes. Prepare: every backup broadcasts its vote. Commit: nodes that saw enough prepares broadcast commit, and decide once they see enough commits. Because everyone broadcasts to everyone, the message count grows with n squared. That is the core of the exam question about PBFT trade-offs: adding nodes improves tolerance, since f grows with n, but message overhead grows quadratically, latency grows, and throughput falls. PBFT works for tens of nodes, not thousands. Security against Sybil attacks also requires a fixed, known membership, which is why PBFT suits permissioned systems.

Later protocols improve on this. Signature aggregation lets the leader collect votes and combine them into one certificate, giving linear message complexity in the optimistic case. Tendermint adds load balance and a linear view change but must wait for the maximum network delay. HotStuff regains responsiveness with an extra round, four phases, and is easy to pipeline. HotStuff two gets back to three rounds. You do not need the details, just the idea that there is a trade-off between rounds, message complexity and responsiveness.

## From digital money to blockchains

Now electronic currency. The basic requirement is that you can only spend money you have, and no one can forge transactions. Digital signatures solve forgery. A nonce, or unique number, in each transaction prevents replay attacks, where someone resends an old valid transaction.

The hard problem is double spending: Alice sends the same hundred euros to Bob and to Carol. Signatures cannot stop this, because both transactions are validly signed. The solution is a ledger that records every transaction, which must be append only and immutable, and everyone must agree on its order. That agreement is consensus. A blockchain is an immutable, distributed and decentralized ledger, and Bitcoin was the first.

## Bitcoin transactions

Bitcoin uses unspent transaction outputs, or UTXOs. Each transaction has inputs, outputs and signatures, and its hash serves as its identifier. Every input points to an output of an earlier transaction. A UTXO behaves like a banknote with a serial number: you must spend it whole, exactly once. If you want to pay less, you add an output that pays the change back to yourself. Any difference between inputs and outputs is the fee, collected by the miner.

Where do coins come from in the first place? From the coinbase transaction. It is the first transaction in every block, it has no real inputs, and it pays the block reward plus fees to the miner who created the block. It is how new coins enter the system and it rewards honest mining. That was a full exam question in twenty nineteen.

## Blocks and proof of work

A block has a header and a body. The header contains the hash of the previous block header, which chains blocks together, the Merkle root, which is a single hash summarizing all transactions in the block, and a nonce. The body holds the transactions, starting with the coinbase.

Mining works like this. Transactions are gossiped through the network into a pool. A miner picks transactions, builds a block, and then guesses nonces until the hash of the block header is below a target, roughly, it starts with a certain number of zeros. The difficulty sets how many. There is no shortcut; you must guess by brute force. Finding such a nonce proves that work was spent: proof of work. The miner gossips the block and others add it to their chain.

The exam once asked for three kinds of hash functions in Bitcoin. Good answers are: the proof of work hash on the block header, the hash chain linking each block to the previous one, the Merkle tree hashing of transactions, transaction identifiers as hashes, and the signature scheme using public and private keys, plus hashing public keys into addresses. Note that proof of work relies on the hash being unpredictable and one-way, not on idempotence; an exam statement claiming "it is the idempotence of hashing that makes it suitable for proof of work" is false.

## How Bitcoin actually reaches consensus

Forks happen: two miners may find blocks at nearly the same time, creating competing chains. The rule is simple: correct nodes accept and extend the longest chain, more precisely the one with the most accumulated work. That chain is the canonical history.

Here is the elegant part. There is no leader and no explicit voting round. A new block is both a proposal and a vote for the entire history it extends. Mining on top of a block is an implicit vote for it. An attacker must out-compute the honest majority. With more than half the hash power, an attacker could censor transactions or even rewrite history by building a longer secret fork from an earlier point. So Bitcoin tolerates fewer than one half Byzantine, measured in computing power, with economic incentives rewarding honesty.

Now the trap. Are proof of work and proof of stake consensus protocols? The lecture is very clear: not really. The consensus rule in Bitcoin is "correct nodes vote for the longest chain". Proof of work only limits how fast proposals can be created, leaving time for blocks to propagate, and makes voting expensive, so that you cannot pretend to be thousands of nodes. That is Sybil resistance. Also, because of forks, a recent block can always be reverted, so safety is only probabilistic. The twenty twenty five exam asked exactly this for four points, so explain both sides: people call them consensus mechanisms, but strictly they are leader selection and Sybil resistance mechanisms inside a longest chain consensus rule.

## Bitcoin's limitations

Fixed block size and fixed block interval give fixed throughput: about seventeen transactions per second in theory, and about seven in practice. Every node replicates the whole state and competes to mine the same next block, so everyone participates in global consensus. Adding nodes does not add throughput. There is no horizontal scalability. That makes the exam statement "blockchain solutions typically scale out linearly" false, and "blockchain solutions typically replicate all data to all nodes" true. Proof of work also burns a lot of energy, deliberately: wasting resources is the purpose. And confirmation is slow, since you wait several blocks to be confident.

## Ethereum and proof of stake

Ethereum uses an account and balance model instead of UTXOs. It originally used proof of work but switched to proof of stake. In proof of stake, validators lock up money as stake. The chance to propose or attest to blocks depends on how much is staked, and misbehavior, like signing two conflicting blocks, gets the stake destroyed, which is called slashing. So the cost of attacking moves from electricity to capital at risk.

Comparing the two for the exam. Performance: Ethereum still has about twelve second blocks and about thirty transactions per second; proof of stake did not raise throughput. Energy: proof of stake is dramatically more efficient. Security: proof of work requires buying hash power; proof of stake requires owning a large share of the staked currency, and attackers lose their stake. Proof of stake also has its own concerns, like the rich getting richer, and long range attacks, and delegated proof of stake, as in EOS, concentrates power in a small set of elected delegates, which raises centralization and collusion risks.

Ethereum is also a virtual machine. Transactions can call smart contracts, which are programs stored on chain that run automatically when conditions are met. Simple payments are just a special case. A recurring exam question is whether multiple smart contracts can be executed concurrently. The careful answer: within a block, every node executes the transactions sequentially in the order the block proposer chose, because contracts share global state and every node must reach exactly the same final state. Different nodes do not split the work; every node re-executes everything to verify the block. So there is no parallel speedup across nodes. Parallelism is only possible for transactions that provably touch different state, which is one motivation for sharding.

## Scaling blockchains

Established blockchains share limitations: high fees, low throughput of seven to thirty transactions per second, and no horizontal scalability. Solutions come in two layers.

Layer one solutions change the base system: bigger blocks, shorter block intervals, or sharding.

Layer two solutions build on top. State or payment channels, like Bitcoin's Lightning Network, let two parties exchange many transactions off chain and only settle the final result on chain. Side chains and rollups bundle many transactions and post a compact result or proof to the main chain. This is the on-chain versus off-chain distinction from the twenty twenty three exam: on-chain transactions are recorded and validated by everyone on the main ledger; off-chain transactions happen elsewhere and only touch the main chain to open, settle or dispute. Cardano Hydra is an example of off-chain heads, small groups that run their own fast ledger and settle back to the main chain.

Sharding divides the network into subsets called shards. Each shard validates, and with full sharding stores, only a subset of the transactions. The challenges are how to map nodes to shards, the security versus performance trade-off, since a smaller shard is faster but easier to take over, and cross-shard validation, because a transaction that depends on another shard's state requires communication between shards.

The lecture's own research example is ScaleGraph. Every account has its own chain, and every transaction is stored on both the sender's and the receiver's chains. Nodes and accounts share an identifier space, just like Kademlia, and the few nodes closest to an account form its validator group. Disjoint transactions can be validated fully in parallel, and shards overlap, so a node can validate for many accounts at once.

## Quick review

Blockchains are suitable for decentralized ledgers: true. They represent a replicated state machine based on a replicated log of all history since the genesis block: true. They replicate all data to all nodes: true for classic designs. They scale out linearly: false. Proof of work and proof of stake are consensus protocols: depends, and strictly no. PBFT tolerates fewer than one third Byzantine nodes and costs order n squared messages. And the general rule: crash tolerance needs two f plus one nodes, Byzantine tolerance needs three f plus one.

That is the end of episode two. Next episode: distributed hash tables and Kademlia, the heart of your lab.
