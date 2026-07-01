# Unified View

Thaleia provides a unified read view over:

- Anatomia domain-view, graph, and spec-links.
- Praeforma saved specs and domains, when Praeforma is configured.

Praeforma is optional for this view. If only Anatomia backend is available, Thaleia returns
`mode: "anatomia-only"` and still shows detected domains, implementor functions, and code-to-spec
clauses from Anatomia.

## API

### `GET /api/unified`

Query:

- `anatomiaProject` or `project`: required Anatomia project id.
- `pfProject`: optional Praeforma project id.
- `label`: optional display label.

Response:

```jsonc
{
  "mode": "integrated",
  "domains": [
    {
      "domain": "Player",
      "status": "covered",
      "implementorCount": 3,
      "praeformaSpecs": [],
      "specLinks": []
    }
  ],
  "specs": [
    {
      "source": "praeforma",
      "code": "SPEC-001-PLAYER-MOVE",
      "title": "Player can move",
      "targetDomains": ["Player"],
      "linkedFunctions": [],
      "implemented": true
    }
  ],
  "summary": {
    "domains": 3,
    "specs": 8,
    "praeformaSpecs": 4,
    "anatomiaSpecClauses": 4
  }
}
```

## Viewer

`GET /unified` serves a lightweight HTML view backed by `/api/unified`.
