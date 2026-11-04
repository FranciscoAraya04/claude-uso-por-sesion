# uso-por-sesion para Claude Code

Un mod para Claude Code (terminal y app de escritorio) que muestra, sobre el cuadro de texto, cuánto del bloque de 5 horas gasta cada sesión, con un punto de color según tu ritmo, freno automático al 83 %, topes por sesión, pausas e historial gráfico.

## Instalar

En una terminal:

```bash
claude plugin marketplace add FranciscoAraya04/claude-uso-por-sesion
```

```bash
claude plugin install uso-por-sesion@uso-por-sesion --scope user
```

O dentro de Claude Code: `/plugin install uso-por-sesion --marketplace FranciscoAraya04/claude-uso-por-sesion` (responde `y` y elige el alcance **user**).

Luego reabre tus sesiones (o escribe `/reload-plugins`). Para actualizar más adelante: `claude plugin update uso-por-sesion@uso-por-sesion`.

Requiere una suscripción de Claude (el porcentaje del bloque de 5 h viene de ahí) y Node, que ya trae Claude Code. Si usas el tema claro, pídele a Claude que lea la sección "Tema claro u oscuro" del README del mod y ajuste los colores.

## Uso

Comandos, botones, colores y cómo funciona el freno: [uso-por-sesion/README.md](uso-por-sesion/README.md).
