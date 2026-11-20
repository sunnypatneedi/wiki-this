---
title: "2026 Data Platform Stack"
section: data-engineering
---

# 2026 Data Platform Stack

This page lists a common 2026 data platform stack from the bottom layer to the top layer.

## Stack (bottom to top)

- **Ingest:** Kafka or Redpanda for events, plus managed connectors
- **Storage:** S3 or equivalent object storage, Iceberg tables
- **Processing:** Flink for streaming, Spark for batch and ML feature jobs
- **Transform:** dbt or Spark SQL, with LLM-assisted authoring
- **Vectors:** pgvector, Qdrant, or Pinecone, indexed per tenant
- **Orchestration:** Dagster or Temporal for durable workflows
- **Serving:** Feature store like Feast, low-latency API layer
- **Observe:** OpenTelemetry traces across pipeline and model calls
- **Govern:** DataHub or OpenLineage for catalog and lineage

## Rule

Keep deterministic paths in plain code. Do not let a model own logic that must never fail.
