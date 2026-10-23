# 08 · Distributed game backends

Sources: [L9 Distributed gaming backends (Carl)](../D7024E%20Lecture%20slides/D7024E_L9_distributed_gaming_backends.pdf), the weak-consistency example in [2026 L7](../D7024E_Lectures_2026/D7024E_L7_%20DataSyncReplication.pdf). The slides list client-side prediction and server reconciliation in the contents but only sketch them; those sections follow the reading the lecture links (Gaffer On Games, Valve's "Latency Compensating Methods" article).

## Core ideas

### What makes multiplayer hard

A group of running instances shares a common state, updated by player input, that must stay synchronized. It is a **soft real-time** system (a tick every 8–100 ms), with many participants, unreliable networks, heterogeneous hardware, and requirements for consistency, fairness and security, all at once. Latency is bounded by physics: SF–NY is 13 ms at light speed, about 19 ms in fibre, more like 30 ms with routers, and ~200 ms for a full input-to-screen round trip through a backend.

### Genres have different requirements (memorise the table)

| Genre | Latency tolerance | State size | Consistency model | Tick rate |
|---|---|---|---|---|
| FPS | very low | small (position, ammo) | hybrid, server-authoritative | 60–128 Hz (CS2, Valorant) |
| RTS | low | large (many units, map) | deterministic lockstep, eventual | 10–30 Hz |
| MMORPG | medium | very large (inventory, quests, world) | eventual, server-side logic | 10–20 Hz |
| Fighting | extremely low | tiny (inputs only) | deterministic lockstep with rollback | variable, with frame delay |
| Turn-based | very high | medium | full consistency | none |
| MOBA | low–medium | medium (skills, cooldowns, creeps) | server-authoritative + reconciliation | 30–60 Hz |

- **Tick rate:** how often the server advances the simulation. Higher means lower input latency, better hit registration and smoother movement, at the cost of server CPU, bandwidth and money.
- **State size** drives bandwidth, update rate and scalability: know what each client actually needs and send only that.
- Choosing the wrong consistency model makes the requirements unreachable (a fighting game needs frame-exact agreement for competitive fairness).

### Architectures

- **Peer-to-peer (Doom era, still optional in Unity):** every client sends inputs to every other and all run the same deterministic simulation. + No server cost, same environment for all. − Bandwidth grows polynomially (n²), joining/leaving is hard, one bad connection hurts everyone, every client is trusted (cheating is easy).
- **Client–server:** clients send input, the server runs the game and sends updates. + Scales better (linear bandwidth), cheating is harder. − Latency is visible, server load and cost, trust issues remain.
- **Hybrid / authoritative server:** client–server where clients also run part of the game logic (prediction). + Hides latency, less bandwidth, tolerant of loss. − Client and server views can diverge and must be reconciled.
- **Server networks** for large games: either distribute clients over servers that exchange state, or **partition the world** so each server owns a region. Costs: more inter-server traffic, latency on hand-over, uneven load (everyone crowds one zone).

### State synchronization techniques

- **Deterministic lockstep (RTS, e.g. StarCraft):** everyone starts from the same state; each frame, players send their inputs to all; every client waits for all inputs of frame n, then simulates it. + Tiny bandwidth (only inputs), full consistency. − Needs bit-exact determinism, the slowest player sets the pace, no late join.
- **Snapshot interpolation (shooters, MOBAs):** the server sends timestamped snapshots; clients buffer them and render slightly in the past, interpolating between the two snapshots around the render time. + Smooth even at low tick rates, no waiting for others' input. − More bandwidth, an intentional delay, prediction is harder.
- **Delta compression:** send only what changed since the last snapshot the client acknowledged. Needs acknowledgements or a fallback to full snapshots after loss.
- **Entity interpolation:** render other players between known positions instead of snapping.
- **Message aggregation:** merge small updates into one packet to save header bytes (28–40 B per UDP/TCP header), at the cost of a little delay.
- **Packet compression:** quantization (fewer bits for positions/angles), Huffman/arithmetic coding; costs CPU and a bit of latency.
- **Idempotent state updates:** send absolute state ("player at (x,y) at tick 1042"), not deltas of actions ("moved 3 m"). A duplicated or reordered packet then does no harm, and the newest tick simply wins. This is why game backends are often based on state updates by idempotent messaging.
- **UDP rather than TCP:** only the latest state matters. TCP's in-order retransmission causes head-of-line blocking and latency spikes, and Nagle's algorithm adds delay. Games build their own selective reliability on UDP (sequence numbers, acks for the few messages that must arrive). A late position update is discarded; a lost one is covered by dead reckoning.

### Latency hiding and lag compensation

- **Client-side prediction:** the client applies its own input immediately instead of waiting for the server, so the player's own movement feels instant.
- **Server reconciliation:** the server is authoritative. Inputs carry sequence numbers; when an authoritative state arrives for input n, the client rewinds to it and re-applies its inputs after n. Mismatches are corrected smoothly.
- **Convergence strategies** when a prediction was wrong: zero order (snap, visible jump), first order (linear blend), higher-order polynomials (smooth curve), all within one frame's time budget.
- **Dead reckoning:** predict a remote object's position from its last known position, velocity and acceleration: s(t) = s₀ + v₀t + ½at². The owner only sends an update when the true position deviates more than a threshold from what others would predict. Saves bandwidth and hides lag; can cause temporary inconsistencies (rubber-banding). Used in FPS, racing, simulations.
- **Server-side rewind (lag compensation):** a player at 50 ms shoots a moving player at 150 ms. Without compensation the shot always misses on the server. The server estimates the shooter's latency, rewinds other players to where the shooter saw them, evaluates the hit there, then restores positions. Favours the shooter ("I was already behind the wall!").
- **Rollback netcode (fighting games, GGPO):** predict the opponent's input (usually "same as last frame"), simulate ahead; when the real input arrives and differs, roll back to that frame and re-simulate. Often combined with a small fixed input delay.

### Scaling to massive (MMO)

- One game server handles a few hundred players at most. **Partition the world** into areas (rooms, zones, quadrants); a **world server** tracks where players are, assigns areas to game servers, and hands players over as they move. Clients keep a connection to the world server and to their current area server.
- **Interest management / area of interest:** clients get only updates about their surroundings ("bubble of attention"). Saves bandwidth and limits what cheaters can see.
- **Moving between areas:** only to adjacent areas under game rules (doors, limited speed). The state of objects near a border is broadcast (e.g. via pub-sub) to the neighbouring server before they cross.
- **"Sharding" / layering (Blizzard's term, not database sharding):** when too many players crowd one area, spin up parallel copies of it and spread players over them. Each copy has its own players, NPCs and resources; players only see others on the same copy. Gave about 5× the population in Classic WoW. Requires that not every player needs to see every other player.
- **Separate services** for things that are not real-time: login, matchmaking, chat, inventory, auction house, leaderboards, typically with databases and consistency guarantees of their own (an item trade must be atomic).
- **Trade-offs of scaling:** less consistency across partitions, hand-over latency and glitches at borders, uneven load when everyone gathers in one place (a world boss, a capital city), players split across copies (worse social experience), more server-to-server traffic, higher operating cost.
- **Can it scale indefinitely? No.** Interactions within one area are inherently all-to-all: if n players can all see and affect each other, the work and the update traffic grow at least like n² and must happen within one tick, on one authoritative simulation (or tightly coupled ones). Partitioning and layering only help when players can be separated. Some things need complete consistency (trades, economy, global events) and their transactions per second cap the system. Speed of light limits how geographically spread one shared area can be. You can scale the *number of players in the game* almost without bound by adding partitions and copies, but not the number of players who interact in the same place at the same time.

### Security and cheating

Never trust the client: sanity-check every value (speed, position, fire rate), keep the server authoritative, use sequence numbers against replay, encrypt and checksum packets, send clients only what they need to see (no wall hacks from hidden data), monitor for anomalies, and at the extreme kernel-level anti-cheat. Security through obscurity eventually fails.

## Likely essay angles

### Five (or four) key concepts for fair, small-message, delay- and loss-tolerant real-time games (2022 Q2d, 2023 Q2c)

Pick and explain: (1) server-authoritative client–server architecture; (2) client-side prediction with server reconciliation; (3) entity/snapshot interpolation; (4) dead reckoning; (5) server-side lag compensation (rewind); (6) UDP with idempotent, absolute state updates and selective reliability; (7) delta compression and quantization; (8) interest management. For "four most important" (2023) a defensible pick for an FPS is 1, 2, 3 and 5, plus a sentence on why UDP.

### Scaling MMOs (2024 Q2c)

Partitioning, world server and hand-over, interest management, layering/"sharding", separating non-real-time services; trade-offs; why not indefinitely (above).

### Design a backend for a genre (2025 Q2a, 6 p)

Structure the answer as requirements → design → QoS → trade-offs → scaling. Example for an **FPS**:

- **Requirements:** very low latency (< 50–80 ms RTT target), small state, 64–128 Hz tick, competitive fairness, anti-cheat, 10–12 players per match, global player base.
- **Design:** dedicated, server-authoritative match servers in many regions; matchmaking service puts players in the nearest region with similar ping and skill; UDP protocol with sequence numbers, absolute state snapshots with delta compression against the last acked snapshot; client-side prediction + reconciliation for own movement; snapshot interpolation (about 2 ticks of buffer) for others; server-side rewind for hit registration with a cap on how far back it rewinds; interest management to avoid leaking hidden enemies.
- **QoS:** measure RTT, jitter and loss per client; adapt interpolation buffer to jitter; tick rate chosen to fit server budget; prioritize nearby/visible entities in each packet; region selection by ping.
- **Trade-offs:** higher tick rate gives better hit reg but costs CPU and bandwidth; larger interpolation buffer is smoother but adds delay; lag compensation helps the shooter but punishes the target ("shot behind cover"); server authority costs hosting but stops most cheating; UDP gives low latency but you implement reliability yourself.
- **Scaling:** match servers are independent and stateless between matches, so scale out horizontally by launching more instances (containers on Kubernetes or a game-server orchestrator like Agones) per region behind matchmaking; autoscale on queue length; persistent data (accounts, inventory, stats) lives in separate replicated services that are not on the real-time path.

For an **MMORPG** the same skeleton changes to: medium latency tolerance, 10–20 Hz, huge state, eventual consistency for the world but strong consistency for trades and inventory, world partitioning with hand-over, interest management and layering, separate database-backed services for persistent character state.

## Old exam questions

### Essay questions

- **2022 Q2d**: five key concepts for real-time multiplayer.
- **2023 Q2c**: four most important properties/approaches for FPS synchronization.
- **2024 Q2c**: scaling massively multiplayer games; can it scale indefinitely?
- **2025 Q2a**: design a distributed backend for a chosen genre.

### True / false / depends

| Exam | Statement (shortened) | Suggested answer |
|---|---|---|
| 2021 Q1w / 2022 Q1w | Game backends are often based on state updates by idempotent messaging | **True** |
| 2021 Q1x | For scalability, games move heavy computation from clients to backends | **False**. To scale, games push prediction, interpolation, rendering and physics approximations to clients; the server keeps only the authoritative essentials. |
| 2022 Q1x | For scalability, games reduce heavy computation from clients but may need more bandwidth | **Depends/False**. Server-authoritative designs do centralize simulation (cheat protection) and need bandwidth for snapshots, but for scalability the usual move is the opposite: offload to clients and cut bandwidth with prediction and dead reckoning. |
