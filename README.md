# uso-por-sesion para Claude Code

Un mod para Claude Code (terminal y app de escritorio) que muestra, sobre el cuadro de texto, cuánto del bloque de 5 horas gasta cada sesión, con un punto de color según tu ritmo, freno automático al 83 %, topes por sesión, pausas e historial gráfico.

## Instalar

En Claude Code:

```
/plugin install uso-por-sesion --marketplace FranciscoAraya04/claude-uso-por-sesion
```

Responde `y` para agregar el catálogo y elige el alcance **user** para tenerlo en todas tus sesiones. Luego reabre tus sesiones (o escribe `/reload-plugins`).

Requiere una suscripción de Claude (el porcentaje del bloque de 5 h viene de ahí) y Node, que ya trae Claude Code.

## Uso

Comandos, botones, colores y cómo funciona el freno: [uso-por-sesion/README.md](uso-por-sesion/README.md).
