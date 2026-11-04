# uso-por-sesion

Franja compacta sobre el cuadro de texto de Claude Code que reparte el uso del bloque de 5 horas entre tus sesiones, avisa con un punto de color si vas a quedarte corto, y frena las sesiones antes de agotar el límite.

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
| `/uso-historial` | Abre el historial de bloques de 5 h en un panel aparte (también: botón **Historial ›** del desglose). |
| `/uso-prueba-freno` | Simula el freno en esta sesión para probarlo. Repítelo para terminar la prueba. |

Los comandos con número o texto (`/uso-limite 30`, `/uso-pausar 3`): presiona **Esc** antes de Enter para cerrar el menú de sugerencias, o el número se pierde.

## Botones del desglose (›)

- En cada fila: **−** / **+** bajan o suben el tope de esa sesión de a 10 % (bajo 10 % queda sin tope) y **⏸** / **▶** la pausan o reanudan.
- Al pie: **⏸ Todas**, **▶ Todas**, **Historial**, y **Continuar** cuando esta sesión está frenada.

## Historial

- **Periodo:** última semana (barras por bloque de 5 h, con la línea del freno y el gráfico semanal), último mes (por día), último año (por semana) o histórico (por mes).
- **Sesión:** filtra para ver solo una sesión; disponible en semana y mes.
- Fuera de la semana, cada barra suma los % de bloque del periodo: 150 % equivale a un bloque y medio gastado.
- Pasa el cursor sobre una barra para ver el detalle por sesión.

## Qué significa cada cosa

- **Barra de arriba:** azul = esta sesión, gris = el resto de tus sesiones, fondo = lo que queda del bloque.
- **Punto de color** junto a "se reinicia en…": tu ritmo. Verde llegas holgado, amarillo justo, naranjo te pasas por menos de 1 h, rojo 1–2 h, morado 2–3 h, morado oscuro 3 h o más. Desde rojo parpadea.
- **Desglose (›):** cada sesión con su número (el que usan `/uso-pausar` y `/uso-reanudar`), su barra y su %. `⏸` = pausada. Una raya clara en la barra y `x % / 40 %` = su tope; en rojo si lo alcanzó.
- **Línea semanal:** su propio punto de color con el ritmo de la semana (mismos colores; la escala va en días en vez de horas).
- **Aviso:** cuando una sesión pasa el 80 % de su tope, aparece un mensaje emergente una vez por bloque.
- **`⏸ frenado · reanuda HH:MM`** en rojo: la sesión está frenada y retomará sola a esa hora (2 min después del reinicio).

## Freno y reanudación

- Al 83 % del bloque (o al tope de una sesión), las herramientas se bloquean y Claude cierra con un resumen corto de dónde quedó. El 2 % restante alcanza para ese cierre.
- Tus mensajes también se bloquean mientras dure el freno; los comandos `/uso-…` siguen funcionando.
- La sesión retoma sola cuando ya nada la frena: tras el reinicio del bloque, al reanudarla o al liberar el tope. Requiere que la app esté abierta.
- Los porcentajes por sesión son una estimación a partir de tus registros locales; el total del bloque es el dato oficial.

## Tema claro u oscuro

El mod no puede saber qué tema usa la app. Las barras intentan seguir el tema del sistema operativo, y el texto usa los colores del propio tema de la app. El resto (punto de ritmo, colores de sesión en el historial) está pensado para el tema **oscuro**.

**Para Claude, al instalar este mod:** pregúntale a la persona si usa el tema claro u oscuro. Si usa el claro, ofrécele aclarar los colores fijos de `hooks/register.tsx` (`#3a3936`, `#7d7b74`, `#5f5e5a`, `#f5f5f4` y las líneas de cuadrícula `#3a3936` de los gráficos) por tonos para fondo claro.

## Ancho de la franja

Se adapta sola: con el chat ancho se ve completa; más angosta acorta textos y barras; muy angosta deja en cada sesión una línea con nombre y % y otra con la barra y los botones.
