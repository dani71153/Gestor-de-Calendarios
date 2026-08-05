# Registro de decisiones de arquitectura

Un ADR (*Architecture Decision Record*) documenta una decisión técnica junto con su contexto, las alternativas descartadas y sus consecuencias. Sirve para no volver a discutir lo ya resuelto, y para saber cuándo una decisión debe reconsiderarse porque cambiaron las condiciones que la justificaban.

Se registran aquí las decisiones estructurales, no cada elección de implementación. El criterio: si dentro de un año alguien podría preguntar «¿por qué está hecho así?», merece un ADR.

## Decisiones

| # | Decisión | Estado | Fecha |
| --- | --- | --- | --- |
| [001](001-byob-frente-a-electron.md) | BYOB frente a runtime empaquetado | Aceptada | 2026-08-04 |

## Formato

Cada archivo se numera correlativamente y sigue la misma estructura: **Contexto**, **Alternativas consideradas**, **Decisión**, **Consecuencias** y **Revisión**.

Un ADR no se edita cuando la decisión cambia: se escribe uno nuevo que lo sustituya, y el anterior pasa a estado *Sustituida por NNN*. El registro conserva así por qué se pensó lo que se pensó en su momento.
