// Generated from learning-pack.json; edit the JSON and run npm run learning:compile.
window.LEARNER_PACK = {
  "schemaVersion": "learning-pack-v1",
  "id": "wiki-this:http-caching",
  "version": "1.0.0",
  "title": "HTTP caching: freshness lifetime",
  "sources": [
    {
      "id": "mdn",
      "version": "2026-11-18-snapshot",
      "title": "MDN: HTTP caching — fresh and stale based on age",
      "url": "https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching#fresh_and_stale_based_on_age",
      "content": "Age already accumulated upstream reduces the remaining freshness lifetime. A cache does not restart max-age when it receives a stored response.",
      "checkedAt": "2026-11-19T01:53:00.000Z"
    },
    {
      "id": "rfc",
      "version": "RFC-9111-2022-06",
      "title": "RFC 9111 §§4.2–4.2.4: freshness and current age",
      "url": "https://www.rfc-editor.org/rfc/rfc9111.html#section-4.2",
      "content": "Compare freshness lifetime with current age, including residence time. Age equal to the lifetime is stale. Separate rules determine whether stale reuse is permitted.",
      "checkedAt": "2026-11-19T01:53:00.000Z"
    }
  ],
  "entries": [
    {
      "id": "freshness-lifetime",
      "title": "Freshness lifetime",
      "objective": "Calculate remaining freshness from a response lifetime and accumulated age.",
      "skillId": "wiki-this:http:calculate-freshness",
      "skillVersion": "1",
      "rubricVersion": "choice-freshness-v1",
      "sourceIds": [
        "mdn",
        "rfc"
      ],
      "explanation": "A response is fresh while its current age is less than its freshness lifetime. Account for age before receipt and time spent in this cache. Reaching the lifetime makes it stale; whether stale reuse is allowed is a separate decision.",
      "taskIds": [
        "freshness-entry",
        "freshness-guided",
        "freshness-check"
      ]
    }
  ],
  "tasks": [
    {
      "id": "freshness-entry",
      "version": "1",
      "entryId": "freshness-lifetime",
      "familyId": "freshness-current-age",
      "kind": "diagnostic",
      "prompt": "An otherwise cacheable response has max-age=60 and a current age of 40 seconds. Five seconds later, how much freshness remains?",
      "choices": [
        {
          "id": "fifteen",
          "text": "15 seconds"
        },
        {
          "id": "sixty",
          "text": "60 seconds"
        },
        {
          "id": "stale",
          "text": "It is already stale"
        }
      ],
      "correctChoiceId": "fifteen",
      "hints": [
        "Compare the total allowed lifetime with the age after those five seconds."
      ],
      "explanation": "Its age becomes 45 seconds. The remaining freshness is 60 − 45 = 15 seconds.",
      "sourceIds": [
        "mdn",
        "rfc"
      ]
    },
    {
      "id": "freshness-guided",
      "version": "1",
      "entryId": "freshness-lifetime",
      "familyId": "freshness-upstream-age",
      "kind": "practice",
      "prompt": "You receive max-age=60 and Age: 45. Assume negligible transfer delay and no larger Date-based age. After 10 seconds in this cache, how much freshness remains?",
      "choices": [
        {
          "id": "fifty",
          "text": "50 seconds"
        },
        {
          "id": "five",
          "text": "5 seconds"
        },
        {
          "id": "fifteen",
          "text": "15 seconds"
        }
      ],
      "correctChoiceId": "five",
      "hints": [
        "Include the age accumulated before this cache received the response.",
        "Add the 10 seconds here to the 45 seconds already accumulated."
      ],
      "explanation": "The current age is 45 + 10 = 55 seconds. The 60-second lifetime leaves 5 seconds of freshness.",
      "sourceIds": [
        "mdn",
        "rfc"
      ]
    },
    {
      "id": "freshness-check",
      "version": "1",
      "entryId": "freshness-lifetime",
      "familyId": "freshness-boundary",
      "kind": "check",
      "prompt": "A response has max-age=120. Its corrected initial age was 100 seconds, and it has spent 20 more seconds in this cache. Is it fresh now?",
      "choices": [
        {
          "id": "fresh",
          "text": "Fresh, with 20 seconds left"
        },
        {
          "id": "reset",
          "text": "Fresh, because receipt restarted the lifetime"
        },
        {
          "id": "stale",
          "text": "Stale: its current age has reached the lifetime"
        }
      ],
      "correctChoiceId": "stale",
      "hints": [
        "Freshness requires current age to be strictly below the lifetime."
      ],
      "explanation": "Current age is 100 + 20 = 120 seconds. At the 120-second boundary it is stale. That alone does not decide whether a separate stale-use rule permits reuse.",
      "sourceIds": [
        "mdn",
        "rfc"
      ]
    }
  ]
};
