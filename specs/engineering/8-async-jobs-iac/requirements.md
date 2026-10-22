# Spec 8 — IaC de los procesos asíncronos (sin desplegar)

## Objetivo

Crear los templates de Infraestructura como Código (IaC) de los 3 procesos asíncronos documentados en `specs/product/infra.md` (Extractos, Intereses, Mora) — como ejercicio de diseño que responde al punto "Cloud native" de `CHALLENGE.md` ("incluí alguna forma de IaC"), **sin desplegarlos ni ejecutarlos** (ver `infra.md` sección 4.2).

## Alcance

**Incluye:** 3 archivos YAML (formato AWS SAM/CloudFormation), uno por proceso, definiendo los recursos de infraestructura descritos en `infra.md`.

**No incluye:**
- Desplegar estos templates a una cuenta de AWS real.
- Código de negocio real dentro de las Lambdas (son stubs/placeholders — el objetivo es mostrar la infraestructura, no la lógica, que de todas formas no se usa en el MVP).
- Cualquier proceso asíncrono nuevo no documentado ya en `infra.md`.

## Ubicación

`backend/iac/` — un archivo por proceso:
- `backend/iac/extractos.yaml`
- `backend/iac/intereses.yaml`
- `backend/iac/mora.yaml`

## Contenido de cada template (según `infra.md`)

### `extractos.yaml` (sección 2.2.1 — enfoque complejo)
- EventBridge Scheduler (cron mensual, día 20).
- Step Functions state machine con Distributed Map.
- 4 Lambdas: exportadora, enqueuer, generadora de extracto, generadora de PDF.
- S3 (manifiesto de cuentas + PDFs generados).
- 2 colas SQS + sus DLQ.

### `intereses.yaml` (sección 2.2.2)
- EventBridge Scheduler (cron diario).
- 1 Lambda (ejecuta el `UPDATE` por lotes).

### `mora.yaml` (sección 2.2.3)
- EventBridge Scheduler (cron diario, antes del de intereses).
- 1 Lambda para los pasos 1-2 (entrar en mora / bloqueo).
- 1 Lambda "detectora" + 1 cola SQS + 1 Lambda "aplicadora" para el paso 3 (aplicación de garantía).

## Criterios de aceptación

- [x] Los 3 archivos YAML son sintácticamente válidos (ej. pasan `sam validate` o `cfn-lint`, aunque no se desplieguen).
- [x] Cada recurso definido en `infra.md` para ese proceso está representado en el template correspondiente.
- [x] Ningún template se despliega ni se conecta al pipeline de CI/CD del Spec 0 — son archivos de documentación/diseño, no parte del build real.
- [x] El código de las Lambdas referenciadas es un stub mínimo (ej. `return {"statusCode": 200}`), dejando claro que no implementan la lógica real.
