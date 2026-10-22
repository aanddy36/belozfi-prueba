# Spec 8 — Worklog

## Estado: completo. Los 3 templates pasan `cfn-lint` sin errores y no están conectados a nada del proyecto real.

## Hecho

- `backend/iac/intereses.yaml` — `AWS::Scheduler::Schedule` (cron diario) + 1 `AWS::Serverless::Function` (stub), sin SQS/Step Functions/RDS Proxy (infra.md: no hace falta, no hay fan-out).
- `backend/iac/mora.yaml` — `AWS::Scheduler::Schedule` (cron diario, antes que intereses) + `MoraStatusFunction` (pasos 1-2, sin fan-out) + `MoraDetectorFunction` + `AWS::SQS::Queue`/DLQ + `CollateralApplierFunction` (paso 3, por cuenta) + `AWS::RDS::DBProxy`/`DBProxyTargetGroup` (necesario por el fan-out de la aplicadora).
- `backend/iac/extractos.yaml` — `AWS::Scheduler::Schedule` (cron mensual, día 20) + `AWS::Serverless::StateMachine` con un `Map` en modo `DISTRIBUTED` (`ItemReader` desde S3, `ItemBatcher` de 500) + 2 buckets S3 (manifiesto, PDFs) + 2 pares SQS/DLQ + 4 Lambdas (exportadora, enqueuer, generadora de extracto, generadora de PDF) + RDS Proxy.
- Todas las Lambdas usan `InlineCode` (sin `CodeUri` aparte) con un stub de 1-2 líneas y un comentario explicando qué haría la lógica real, citando la sección correspondiente de `infra.md`.
- Los recursos que dependen de una VPC/DB real (RDS Proxy, su rol, el secret de credenciales) se declaran como `Parameters` del template (`VpcSubnetIds`, `DbProxyVpcSecurityGroupIds`, `DbCredentialsSecretArn`, `DbProxyTargetDbInstanceIdentifier`) — sin hardcodear IDs de una cuenta de AWS real.

## Probado

- Se instaló `cfn-lint` (`pip3 install --user cfn-lint` — no había ninguna herramienta de validación de CloudFormation/SAM disponible en la máquina) y se corrió contra los 3 archivos: **los 3 pasan con exit code 0, sin warnings ni errores**.
- Se verificó con `grep -rl "iac/"` sobre todo el repo (scripts, YAMLs de CI, código Python/TS) que **nada** referencia `backend/iac/` — están completamente aislados del proyecto real, tal como pide el criterio de aceptación.
- Se armó una tabla de mapeo recurso → sección de `infra.md` en `design.md` para confirmar visualmente que cada pieza de infraestructura documentada (EventBridge, Step Functions, S3, SQS+DLQ, las Lambdas, RDS Proxy) está representada en el template correspondiente — sin piezas faltantes ni agregadas de más.

## Decisiones de implementación no especificadas en `infra.md`/`requirements.md`

- **Formato**: AWS SAM (superset de CloudFormation) en vez de CloudFormation puro — permite `AWS::Serverless::Function`/`AWS::Serverless::StateMachine`, más compactos, mezclados con recursos CFN nativos donde SAM no tiene tipo propio (SQS, S3, RDS Proxy).
- **`cfn-lint` instalado globalmente** (no en el venv del backend) vía `pip3 install --user` — es una herramienta de desarrollo/CI, no una dependencia del proyecto, así que no se agregó a `requirements.txt`.
- **Horarios de los cron**: mora a las 2am, intereses a las 3am (`America/Santiago`) — siguiendo el orden ya acordado en `prompts.md` (mora antes que intereses, para que una cuenta que entra en mora hoy ya tenga la tasa de mora aplicada el mismo día).
- **`State: DISABLED`** en los 3 `AWS::Scheduler::Schedule` — otra señal explícita, además de nunca desplegarse, de que estos jobs no deben correr.
