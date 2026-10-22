# Spec 8 — Design

## Formato elegido

Los 3 archivos son templates **AWS SAM** (`Transform: AWS::Serverless-2016-10-31`) — superset de CloudFormation, permite usar `AWS::Serverless::Function`/`AWS::Serverless::StateMachine` (más compactos) mezclados con recursos CFN nativos (`AWS::SQS::Queue`, `AWS::S3::Bucket`, `AWS::RDS::DBProxy`) donde SAM no tiene un tipo propio.

Las Lambdas usan `InlineCode` (el código vive adentro del YAML, no en un directorio aparte) — son stubs de una línea, no vale la pena un `CodeUri` separado para este ejercicio de diseño.

Los recursos que necesitan datos de una VPC/DB real (RDS Proxy, su rol, el secreto de credenciales) se declaran como `Parameters` del template, no hardcodeados — así el YAML es sintácticamente completo y válido sin que haga falta una cuenta de AWS real detrás (nunca se despliega, Spec 8 `requirements.md`).

## Validación

Se instaló `cfn-lint` (`pip install --user cfn-lint`) para validar sintaxis real contra los 3 templates, tal como pide el criterio de aceptación ("pasan `sam validate` o `cfn-lint`") — no había ninguna herramienta de este tipo disponible en la máquina.

## Mapeo recurso → sección de `infra.md`

### `extractos.yaml` (sección 2.2.1, enfoque complejo)

| Recurso YAML | Pieza de `infra.md` |
|---|---|
| `AWS::Scheduler::Schedule` (cron `0 0 20 * ? *`) | EventBridge Scheduler mensual |
| `AWS::Serverless::StateMachine` (Distributed Map) | Step Functions, fan-out sin partición manual |
| `AWS::S3::Bucket` (manifest) | S3, manifiesto de cuentas |
| `AWS::S3::Bucket` (statements) | S3, PDFs generados |
| `AWS::SQS::Queue` + DLQ (x2 pares) | SQS1/SQS2 + sus DLQ |
| `AWS::Serverless::Function` (x4: exportadora, enqueuer, generadora, PDF) | las 4 Lambdas del flujo |
| `AWS::RDS::DBProxy` | RDS Proxy |

### `intereses.yaml` (sección 2.2.2)

| Recurso YAML | Pieza de `infra.md` |
|---|---|
| `AWS::Scheduler::Schedule` (cron diario) | EventBridge diario |
| `AWS::Serverless::Function` (única) | la única Lambda del `UPDATE` por lotes |

Sin SQS/Step Functions/S3/RDS Proxy — `infra.md` es explícito en que no hacen falta acá (no hay fan-out).

### `mora.yaml` (sección 2.2.3)

| Recurso YAML | Pieza de `infra.md` |
|---|---|
| `AWS::Scheduler::Schedule` (cron diario, antes que intereses) | EventBridge diario |
| `AWS::Serverless::Function` (status: mora/bloqueo) | Lambda de los pasos 1-2, sin fan-out |
| `AWS::Serverless::Function` (detectora) | Lambda que identifica cuentas en día 30 |
| `AWS::SQS::Queue` + DLQ | desacopla detección de aplicación |
| `AWS::Serverless::Function` (aplicadora) | Lambda que aplica la garantía por cuenta |
| `AWS::RDS::DBProxy` | necesario acá por el fan-out de la aplicadora |

## Nota

Ningún template referencia ni se registra en `scripts/dev.sh`, `app/main.py`, ni ningún workflow de CI/CD — viven aislados en `backend/iac/`, sin que nada del proyecto real los importe o invoque.
