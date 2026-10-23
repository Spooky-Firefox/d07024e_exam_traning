# Episode one. Distributed consensus: Paxos, Zookeeper and Raft.

Welcome to the D7024E exam audio series. This episode is about distributed consensus, the topic that shows up on almost every old exam. We will cover what consensus actually promises, the assumptions you must make to get it, two-phase commit and why it blocks, Paxos, Zookeeper and its Zab protocol, Raft, and finally the classic exam traps. Byzantine consensus and blockchains get their own episode, so here we focus on honest nodes that can crash.

## What consensus is

Consensus means that a group of nodes agrees on a value. The value can be anything: a single number, who the leader is, or the next command in a log. Several problems that sound different are really the same problem. Agreeing on a value, atomic broadcast, which means all or nothing delivery in a total order, state machine replication, and log replication are all equivalent. If you can solve one, you can solve the others.

Every consensus protocol is judged on two properties. The first is safety, loosely "nothing bad ever happens". Only a value that was proposed may be chosen, only a single value is chosen, and no node believes a value was chosen unless it really was. The second is liveness, loosely "something good eventually happens". Some proposed value is eventually chosen, and every correct node eventually learns it.

Here is the key insight. Real protocols guarantee safety always, but they cannot guarantee liveness always. The famous FLP impossibility result says that in a fully asynchronous network, no deterministic protocol can guarantee liveness if even one node may crash. The reason is that you cannot tell a crashed node from a slow one. So practical protocols assume partial synchrony: safety never depends on timing, but progress happens once the network behaves well for long enough. An exam statement like "if liveness is provided, safety is automatically obtained" is false. They are independent, and safety is the one we never give up.

## The assumptions you must make

To reach consensus you have to make assumptions. In general you must assume something about connectivity and about the fraction of nodes that are alive. That exact statement has appeared as a true or false question on several exams, and the answer is true.

Typical assumptions are these. The set of participating nodes is known in advance, because you cannot count a majority if you do not know how many voters exist. Nodes fail by crashing, not by lying. Messages may be delayed, lost or reordered, but not forged. And to detect a missing message you rely on timeouts and sequence numbers. Many consensus systems are built on top of a reliable messaging layer, such as TCP, so that the protocol itself does not have to handle every lost packet.

## Two-phase commit and why it blocks

The first attempt at agreement is two-phase commit. One coordinator proposes a value to all participants. In phase one, the prepare or voting phase, every participant answers yes or no. Note that a participant can only vote on the proposed value; it cannot suggest an alternative. In phase two, if everyone voted yes, the coordinator tells all participants to commit. If even one voted no, everyone is told to abort, and a new round is needed.

Two-phase commit gives you atomicity, all or nothing, and it fits ACID transactions well. But it has a fatal weakness: it blocks if the coordinator crashes. Participants that voted yes are stuck. They cannot commit, because they do not know whether everyone agreed, and they cannot abort, because the coordinator might already have told someone to commit. That is why we need protocols where leadership can move.

## Paxos

Paxos, by Leslie Lamport, solves consensus with crash failures in an asynchronous network. It is guaranteed safe, and once a value is chosen it never changes. It is not guaranteed live; it terminates when a large enough part of the network is working for long enough.

Paxos has three roles: proposer, acceptor and learner. One node usually plays several roles. Each round has a unique, increasing round number and is driven by one proposer, but the leader can be different in every round. If you are in round j and hear a message from round j plus one, you abandon your round and follow the newer one.

A round has two phases, each with two steps, so you will hear it called four steps or sometimes three phase. In phase one A, the proposer picks a new round number n and sends a prepare message to a majority of acceptors. In phase one B, each acceptor that has not seen a higher number replies with a promise: it will not accept any proposal numbered less than n, and it reports the highest numbered proposal it already accepted, if any. In phase two A, if the proposer gets promises from a majority, it sends an accept request with a value. If some acceptor reported an earlier accepted value, the proposer must use that value rather than its own. In phase two B, acceptors accept unless they have promised a higher round in the meantime, and they announce "accepted" to the learners. Once a majority has accepted, the value is chosen, even if some learner has not heard about it yet.

Why does this work? Because any two majorities overlap in at least one node. That overlapping node carries knowledge of earlier accepted values into later rounds, so two different values can never both be chosen.

Some numbers to remember. To tolerate f crashed nodes, you need at least two f plus one acceptors, so three, five or seven nodes. A successful round costs at least four times N minus one messages: prepare, promise, accept and accepted. A known problem is dueling proposers, where two nodes keep starting higher rounds and block each other. The fix is randomized back-off timers, so that eventually one proposer gets a round to itself.

## Leaders and epochs

Electing a leader in every round is expensive. The practical improvement is to elect a leader once and let it stay leader for a long period, called an epoch in Zookeeper and a term in Raft. The leader then orders all updates cheaply, and the expensive election only runs when the leader fails. Terms and epochs are numbered and always increase, which lets every node detect and reject messages from a stale, old leader. That answers the exam question "why are terms used in non-Byzantine consensus": they give a logical clock for leadership, so old leaders are fenced out and each term has at most one leader.

## Zookeeper and Zab

Apache Zookeeper is a coordination service: configuration, group membership, leader election, naming and locks. Its data model is a tree of znodes, like a small file system. Each znode holds data that is read and written atomically as a whole. Znodes can be persistent, ephemeral, which means they disappear when the client session ends, and sequential, which means they get an increasing counter appended to their name. Clients can set watches, one-time triggers that notify them when a znode changes.

All Zookeeper servers keep a full copy of the data in memory. A client connects to any one server and reads directly from it. All writes, however, are forwarded to the leader, and the leader answers once a majority of servers has persisted the change. The consequence: read throughput and fault tolerance scale when you add servers, but write throughput does not. It may even drop, because the leader must reach more followers.

Zookeeper replicates with Zab, the Zookeeper atomic broadcast protocol. Zab guarantees reliable delivery, so a message delivered to one server is eventually delivered to all correct servers. It guarantees total order, so everyone sees messages in the same order. And it guarantees the prefix property: if a leader's message is delivered, every earlier message from that leader is also delivered. Every update carries a zxid, made of the epoch number and a counter. A new leader must have the highest zxid among the voters, it starts a new epoch, syncs followers, and only after a quorum acknowledges a NEW_LEADER proposal does it start accepting writes. Uncommitted proposals that the new leader never saw are discarded, which is safe because they never reached a quorum.

The difference from Paxos: Paxos picks a leader every round and handles loss and reordering in one mechanism. Zab uses the heavy election only to pick a persistent leader, and uses TCP between servers, so messages arrive in first in, first out order.

One more exam favorite. Is Zookeeper a good solution for a large number of nodes to keep track of whether each of them is alive? The expected answer is depends, leaning false: ephemeral znodes do support membership for a moderate group, but every heartbeat and every change goes through one leader and is replicated everywhere, and many watches on one znode cause a herd effect. Consensus is for small amounts of slowly changing data, not for a massive, rapidly changing liveness table.

## Raft

Raft was designed to be understandable. It maintains a replicated log, and every server applies the same commands in the same order to its own state machine. That is the replicated state machine idea. So when an exam asks "in Raft, what is replicated?", the answer is the log of client commands, not the data store itself.

A Raft cluster is small, typically three, five or seven servers. Each server is a follower, a candidate or a leader. Servers talk using two idempotent remote procedure calls. RequestVote is used by candidates during an election. AppendEntries is used by the leader to replicate log entries, and an empty AppendEntries doubles as a heartbeat.

Leader election works like this. Everyone starts as a follower. If a follower hears nothing from a leader during its election timeout, it becomes a candidate, increments the term, votes for itself and asks the others for votes. Each server grants at most one vote per term. A candidate with votes from a majority becomes leader. If the vote is split, nobody wins, and candidates wait a random delay, in the lecture example between one hundred and fifty and three hundred milliseconds, before trying again. Randomness breaks the tie.

Log replication: the leader takes a client command, appends it to its log, and sends AppendEntries to all followers in parallel. Once a majority has stored the entry, the leader commits it, applies it to its state machine and replies to the client. Followers learn the commit index from the next AppendEntries or heartbeat. Committing an entry also commits all earlier entries, because Raft never skips entries. Slow followers simply get the request again, which is safe because the calls are idempotent.

Two safety rules matter. First, the log matching property: if two logs have an entry with the same index and term, then that entry and all earlier entries are identical. Second, the election restriction: a server only votes for a candidate whose log is at least as up to date as its own. Since the majority that stored a committed entry and the majority that elects the new leader must overlap, a new leader always has every committed entry. A subtle detail: a leader only commits entries from its own current term by counting replicas. Older entries become committed indirectly when a newer entry is committed.

Raft versus Zookeeper: Raft replicates a simple log of commands; Zookeeper replicates a richer tree of znodes. Raft versus Paxos: similar guarantees, but Raft keeps a leader for a whole term, separates election from replication, and is much easier to implement correctly.

Etcd is the main Raft example in the course. It is a key value store that keeps a highly available replicated log with Raft. It replicates everything to every member, with no sharding, so it does not scale out. It should hold metadata and configuration, for example the entire state of a Kubernetes cluster.

## Other leader elections

Two simpler election algorithms appear in the slides. In a ring election, nodes pass a token around a logical ring, and the node with the highest identifier, or the token holder, wins. In the bully algorithm, a node that notices the leader is gone contacts all nodes with higher identifiers. If none answer, it declares itself leader. If someone higher answers, that node takes over. The highest live identifier always wins, hence the name bully. Neither of these handles network partitions safely the way majority-based protocols do.

## Exam traps to remember

Let us finish with the statements that keep coming back.

Non-Byzantine consensus typically assumes a small number of traitors. False. Non-Byzantine means honest nodes that may crash. A single traitor can stop Paxos from ever reaching consensus.

Non-Byzantine consensus based on pairwise messaging requires N equals two f plus one nodes to handle f failures. True. A majority must survive.

Non-Byzantine consensus is designed to be horizontally scalable. False. Every write goes through one leader and is replicated to every node. Adding nodes adds fault tolerance and maybe read capacity, but not write throughput.

Leader-based consensus can handle a large number of nodes and geographic spread. False, or at best depends. Latency between distant sites slows every commit, and more nodes mean more messages per decision.

Leader-based consensus is an efficient way of providing non-Byzantine consensus. True. That is the whole point of terms and epochs.

In global consensus, a key requirement is that new nodes can join automatically to scale out and improve write performance. False. Membership in a consensus group is deliberately small and fixed, it is changed carefully, and more members never improve write performance.

Massively distributed data stores, Kademlia included, typically do not use global consensus at all. They rely on eventual consistency, and use consensus only for small, slowly changing system properties.

That is the end of episode one. If you remember one thing, remember this: majorities overlap, safety is never traded away, and liveness needs the network to behave for a while. Next episode: Byzantine faults and blockchains.
