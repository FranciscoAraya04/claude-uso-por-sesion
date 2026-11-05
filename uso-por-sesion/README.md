# uso-por-sesion

Franja compacta sobre el cuadro de texto de Claude Code que reparte el uso del bloque de 5 horas entre tus sesiones, avisa con un punto de color si vas a quedarte corto, y frena las sesiones antes de agotar el límite.


## Privacy and permissions

**Nothing leaves your computer.** The plugin makes no network requests and sends no data to Anthropic or anyone else. Everything it stores stays in Claude Code's local plugin store (`~/.claude/plugins/store/`) and in `.scan-cache.json` inside the plugin folder.

What it does, and why:

- **Runs one program: `node hooks/scan.js`** (the fixed script that ships in this plugin, with Node from Claude Code). Once a minute, and on session start, it reads your local session logs in `~/.claude/projects/*/*.jsonl`. From each session it takes only the token counts, the model name and the session title, to split the 5-hour block between sessions. It prints the result to the plugin and never sends it anywhere. Message text is not read for anything else and is not stored.
- **Reads the 5-hour and weekly limits** that Claude Code already shows (`session.usage`), to know the block total and the reset time.
- **Submits one fixed prompt to resume a braked session** (`prompt.submit`), only after the brake, cap or pause that stopped it is gone. The text is always one of three fixed sentences, for example "The 5-hour block has reset (uso-por-sesion brake). Continue the task exactly where you left off." It carries no data from your sessions.
- **Blocks tool calls while a session is braked** (`tool.call`). The block only applies when the 5-hour block reaches the global brake (83 % by default), the session reaches its own cap, or you paused it. Claude then gets a fixed message asking it to stop and summarize where it left off. Otherwise every tool call passes through unchanged, and the plugin never approves anything on your behalf. You can lift the brake at any time with `/uso-continuar` (`/session-continue`), the Continue button, or by raising the brake in Settings.
- **Holds your own messages while a session is braked** (`prompt.submit`) and tells you why. Messages pass through unchanged when nothing is braking the session, and the plugin's own resume prompt always passes.
- **Handles only its own slash commands** (`command.run` for `/uso-…` and `/session-…`). Other commands are not touched.
- **Runs one slash command by itself:** the **Continue** button in the band runs `/uso-continuar` for this session, which is the same as typing it. Nothing runs without that click.

## Privacidad y permisos (resumen)

No envía nada fuera de tu computador. Solo ejecuta `node hooks/scan.js` para leer los conteos de tokens de tus registros locales. Mientras una sesión está frenada, bloquea sus herramientas y retiene tus mensajes; de lo contrario los deja pasar sin cambios. Para reanudar envía solo frases fijas, y el botón **Continuar** ejecuta `/uso-continuar`.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `/uso` | Oculta o muestra la franja (también la ✕ de la franja). |
| `/uso-limite 40` | Tope para **esta** sesión: 40 % del bloque de 5 h. Al llegar, se frena sola. Toda sesión parte con **35 %**. |
| `/uso-limite` | Muestra el tope actual de esta sesión. |
| `/uso-limite quitar` | Quita el tope de esta sesión. |
| `/uso-pausar` | Pausa **esta** sesión. |
| `/uso-pausar 3` | Pausa la sesión n.º 3 del desglose (desde cualquier sesión). |
| `/uso-pausar todas` | Pausa todas las sesiones del desglose. |
| `/uso-reanudar` / `/uso-reanudar 3` / `/uso-reanudar todas` | Igual, pero reanuda. Las que estaban trabajando retoman solas en menos de un minuto. |
| `/uso-continuar` | Libera el freno del 83 % y el tope **solo de esta sesión** hasta el próximo reinicio. |
| `/uso-continuar 3` / `/uso-continuar todas` | Lo mismo para la sesión n.º 3 del desglose, o para todas. |
| `/uso-config` | Abre el panel: **Sesiones** (desglose completo), **Ajustes**, **Historial** y **Comandos** (también: botón **⚙ Configuración** del desglose). |
| `/uso-historial` | Abre el mismo panel directo en el historial. |
| `/uso-sin-freno` / `/uso-sin-freno 3` | Activa o quita el **∞**: esa sesión ignora el freno global hasta el reinicio (máximo 1 a la vez por defecto). |
| `/uso-prueba-freno` | Simula el freno en esta sesión para probarlo. Repítelo para terminar la prueba. |

Cada comando tiene un alias en inglés (`/session-usage`, `/session-limit`, `/session-pause`…; lista en el [README principal](../README.md)). Los dos funcionan igual con cualquier idioma.

Los comandos con número o texto (`/uso-limite 30`, `/uso-pausar 3`): presiona **Esc** antes de Enter para cerrar el menú de sugerencias, o el número se pierde.

## Botones del desglose (›)

- En cada fila: **−** / **+** bajan o suben el tope de esa sesión según el paso configurado (10 % por defecto) (bajo 10 % queda sin tope), **⏸** / **▶** la pausan o reanudan, Cuando el tope llega a 100 % (o la sesión no tiene tope), el **+** se convierte en **∞**: dejarla sin freno global. Con ∞ activo, **−** lo quita. Si ya está el máximo de sesiones ∞, los demás ∞ quedan tenues.
- Si no caben todas, la franja muestra las que caben y **Ver todas** abre la pestaña **Sesiones** del panel, con la lista completa y los mismos botones.
- Al pie: **⏸ Todas**, **▶ Todas**, **⚙ Configuración**, y **Continuar** cuando esta sesión está frenada.

## Configuración

En **⚙ Configuración → Ajustes** cada persona ajusta con − / +:

| Ajuste | Por defecto | Qué hace |
| --- | --- | --- |
| Margen de cierre | 2 % | Cuánto antes del tope de una sesión (o del 100 % en una sesión ∞) empieza el cierre ordenado. |
| Freno global | 83 % | % del bloque de 5 h en que se frenan todas las sesiones. Lo que queda sobre él es el margen para cerrar ordenado. |
| Reanudar tras el reinicio | 2 min | Espera después del reinicio antes de retomar las sesiones frenadas. |
| Tope por defecto | 35 % | Tope de toda sesión sin uno propio (0 = sin tope). |
| Paso de − / + | 10 % | Cuánto sube o baja el tope de una sesión con cada toque. |
| Sesiones sin freno (∞) | 1 | Cuántas pueden ignorar el freno global a la vez (0 = desactivado). |
| Aviso del tope | 80 % del tope | Cuándo avisar que una sesión se acerca a su tope. |
| Idioma | el del sistema | Español o inglés. |

**Restaurar valores por defecto** vuelve a estos valores. Los ajustes valen para todas tus sesiones.

## Historial

- **Periodo:** última semana (barras por bloque de 5 h, con la línea del freno y el gráfico semanal), último mes (por día), último año (por semana) o histórico (por mes).
- **Sesión:** filtra para ver solo una sesión; disponible en semana y mes.
- **Agrupar** (semana y mes): **por ventana de 5 h** (cada barra rotulada con su hora de reinicio y líneas punteadas entre días) o **por día**.
- El gráfico semanal cubre el periodo completo, del inicio al reinicio semanal, con los días marcados, una raya en el momento actual y la proyección lineal a tu ritmo; si llegas al 100 % antes del reinicio, marca el punto y dice el día y la hora. Con pocas barras, el valor va escrito encima de cada una.
- Fuera de la semana, cada barra suma los % de bloque del periodo: 150 % equivale a un bloque y medio gastado.

## Qué significa cada cosa

- **Barra de arriba:** azul = esta sesión, gris = el resto de tus sesiones, fondo = lo que queda del bloque.
- **Punto de color** junto a "se reinicia en…": tu ritmo. Verde llegas holgado, amarillo justo, naranjo te pasas por menos de 1 h, rojo 1–2 h, morado 2–3 h, morado oscuro 3 h o más. Desde rojo parpadea.
- **Desglose (›):** cada sesión con su número (el que usan `/uso-pausar` y `/uso-reanudar`), su barra y su %. `⏸` = pausada. Una raya clara en la barra y `x % / 40 %` = su tope; en rojo si lo alcanzó.
- **Línea semanal:** su propio punto de color con el ritmo de la semana (mismos colores; la escala va en días en vez de horas).
- **Aviso:** cuando una sesión pasa el 80 % de su tope, aparece un mensaje emergente una vez por bloque.
- **`⏸ frenado · reanuda HH:MM`** en rojo: la sesión está frenada y retomará sola a esa hora (2 min después del reinicio).

## Freno y reanudación

- **Sesión ∞:** su nombre aparece en el color de Claude con ∞ en el desglose y en su propia franja. Ignora el freno global hasta el próximo reinicio, respeta su propio tope y se detiene sola en 100 % − margen de cierre, para no llegar al corte de Anthropic. Las demás, al frenarse, avisan qué sesión sigue sin freno.
- **Topes:** el cierre empieza en *tope − margen de cierre*, así la sesión termina cerca de su tope sin pasarse.

- Al 83 % del bloque (ajustable) (o al tope de una sesión), las herramientas se bloquean y Claude cierra con un resumen corto de dónde quedó. El 2 % restante alcanza para ese cierre.
- Tus mensajes también se bloquean mientras dure el freno; los comandos `/uso-…` siguen funcionando.
- La sesión retoma sola cuando ya nada la frena: tras el reinicio del bloque, al reanudarla o al liberar el tope. Requiere que la app esté abierta.
- Los porcentajes por sesión son una estimación a partir de tus registros locales; el total del bloque es el dato oficial.

## Tema claro u oscuro

El mod no puede saber qué tema usa la app. Las barras intentan seguir el tema del sistema operativo, y el texto usa los colores del propio tema de la app. El resto (punto de ritmo, colores de sesión en el historial) está pensado para el tema **oscuro**.

**Para Claude, al instalar este mod:** pregúntale a la persona si usa el tema claro u oscuro. Si usa el claro, ofrécele aclarar los colores fijos de `hooks/register.tsx` (`#3a3936`, `#7d7b74`, `#5f5e5a`, `#f5f5f4` y las líneas de cuadrícula `#3a3936` de los gráficos) por tonos para fondo claro.

## Ancho de la franja

Se adapta sola: con el chat ancho se ve completa; más angosta acorta textos y barras; muy angosta deja en cada sesión una línea con nombre y % y otra con la barra y los botones.
