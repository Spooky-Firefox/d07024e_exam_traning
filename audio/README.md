# D7024E exam audio

Five listenable episodes covering the topics that come up most often on the old exams. Each one is about 15 minutes. They're written to be heard rather than read, and each ends with the true/false/depends traps from past exams.

| # | Episode | Main sources |
|---|---------|--------------|
| 1 | [Consensus: Paxos, Zookeeper, Raft](scripts/01_consensus.md) · [mp3](mp3/01_consensus.mp3) | 2025 L7 Consensus |
| 2 | [BFT and blockchain](scripts/02_bft_and_blockchain.md) · [mp3](mp3/02_bft_and_blockchain.mp3) | 2025 L8 BFT consensus & blockchain |
| 3 | [Kademlia and DHTs](scripts/03_kademlia_and_dht.md) · [mp3](mp3/03_kademlia_and_dht.mp3) | 2025 L2, L4-1 DHT, Kademlia paper |
| 4 | [Consistency and replication](scripts/04_consistency_and_replication.md) · [mp3](mp3/04_consistency_and_replication.mp3) | 2026 L7 and 2025 L5/L6 data sync, collaborative editing |
| 5 | [Orchestration and Kubernetes](scripts/05_orchestration.md) · [mp3](mp3/05_orchestration.mp3) | 2026 L8 Orchestration, 2025 L11 Modern compute |

The scripts double as written summaries. A few points go beyond the slides and are flagged as such in the text, like the Kubernetes HPA formula and Cardano Hydra. The scripts were AI-generated from the slides, so check anything you plan to cite in the exam against the lecture material.

## Regenerating the audio

The voice is [Kokoro-82M](https://github.com/hexgrad/kokoro) (Apache-2.0), running locally via `kokoro-onnx`. No API keys or paid services are needed.

```sh
pip install kokoro-onnx soundfile        # ffmpeg must also be installed
mkdir -p audio/models && cd audio/models
curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
cd ../..
python3 audio/generate_audio.py              # all episodes
python3 audio/generate_audio.py 03           # only scripts starting with "03"
python3 audio/generate_audio.py --voice af_heart --speed 1.1
```

If a word is mispronounced, add a respelling to `PRONUNCIATIONS` in `generate_audio.py`. That way the script text stays readable.
