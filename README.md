# d07024e_exam_traning

Study material for the D7024E (Distributed and Mobile Computing Systems) home exam.

## Flashcard website

A static site in [`docs/`](docs/) with two kinds of cards:

- **Exam statements**: all 166 question-1 true/false/depends statements from the 2018–2025 exams in `D7024E Exam/`. Each has a suggested answer and a short explanation. There is no official answer key, so treat the answers as a study aid. On the exam a well-argued "depends" also counts.
- **Concept cards**: 139 question/answer cards from the lecture slides (Raft, Paxos/ZooKeeper, PBFT, blockchain, Kademlia/DHTs, CAP and consistency models, clocks, CRDTs/OT, pub-sub/Kafka, MapReduce, gaming backends, microservices, Kubernetes and orchestration, and more).

Features: shuffle, filter by deck, exam year and topic, "I know this" tracking with a hide-known filter, a browse/search view, and keyboard shortcuts (`T`/`F`/`D` to answer, `Space` to reveal, `K`/`L` to mark, arrow keys to navigate). Progress is stored in the browser's localStorage.

### Run locally

Open `docs/index.html` directly in a browser, or serve the folder:

```sh
python3 -m http.server 8000 --directory docs
# then open http://localhost:8000
```

### Publish on GitHub Pages

In the repository's **Settings → Pages**, choose **Deploy from a branch**, branch `main`, folder `/docs`.

### Editing cards

- `docs/data/exam-cards.js`: exam statements (`id`, `exam`, `q`, `topics`, `statement`, `answer`, `why`)
- `docs/data/concept-cards.js`: concept cards (`id`, `topics`, `q`, `a`, `src`). Lines in `a` starting with `- ` render as a bullet list.
- `docs/data/topics.js`: topic ids and labels

Run `node scripts/check-cards.js` after editing to check ids, topics and answers.
