# Verificaci?n de la malla adaptativa

Modelo de alta fidelidad: superficie derivada simplificada y estanca. No se incluye ning?n STL ni la malla de referencia original.

M?trica: distancia punto-superficie sim?trica entre la malla adaptativa y la malla de referencia, dividida por la diagonal de la envolvente. Envolvente: diferencia m?xima de dimensiones.

| Preset | Error de malla | Envolvente | Tri?ngulos | Estanca |
| --- | ---: | ---: | ---: | :---: |
| `connector-360` | 0.061 % | ? | 12000 | s? |
| `edge7-corner` | 0.025 % | ? | 10000 | s? |
| `leg-connector-peg-5mm` | 0.021 % | ? | 10000 | s? |
| `leg-connector` | 0.021 % | ? | 10000 | s? |
| `angled30` | 0.017 % | ? | 10000 | s? |
| `angled45-l` | 0.015 % | ? | 10000 | s? |
| `leg-connector-peg` | 0.015 % | ? | 10000 | s? |
| `angled45` | 0.014 % | ? | 10000 | s? |
| `leg30-connector-peg-5mm` | 0.013 % | ? | 10000 | s? |
| `leg30-connector-peg` | 0.013 % | ? | 10000 | s? |
| `leg30-connector` | 0.011 % | ? | 10000 | s? |
| `edge5-l-flipped` | 0.011 % | ? | 10000 | s? |
| `edge5-corner` | 0.009 % | ? | 10000 | s? |
| `connector-peg` | 0.008 % | ? | 10000 | s? |
| `connector-peg-5mm` | 0.008 % | ? | 10000 | s? |
| `connector` | 0.007 % | ? | 10000 | s? |
| `edge3-l-flipped` | 0.006 % | ? | 10000 | s? |
| `angled45-r` | 0.006 % | ? | 10000 | s? |
| `angled30-l` | 0.005 % | ? | 10000 | s? |
| `edge4-l-flipped` | 0.005 % | ? | 10000 | s? |
| `edge3-l` | 0.005 % | ? | 10000 | s? |
| `angled30-r` | 0.005 % | ? | 10000 | s? |
| `edge5-l` | 0.004 % | ? | 10000 | s? |
| `edge4-corner` | 0.004 % | ? | 10000 | s? |
| `edge4-l` | 0.004 % | ? | 10000 | s? |
| `edge3-corner` | 0.004 % | ? | 10000 | s? |
| `edge3-t` | 0.003 % | ? | 10000 | s? |
| `edge2-corner` | 0.003 % | ? | 10000 | s? |
| `edge3-flat` | 0.002 % | ? | 10000 | s? |
| `edge4-flat` | 0.002 % | ? | 10000 | s? |
| `edge1-paw` | 0.001 % | ? | 10000 | s? |
| `edge2-flat` | 0.001 % | ? | 10000 | s? |
| `leg45-s-r` | 0.000 % | ? | 3790 | s? |
| `leg45-s` | 0.000 % | ? | 7252 | s? |
| `edge1` | 0.000 % | ? | 9310 | s? |
| `edge1-boot` | 0.000 % | ? | 9300 | s? |
| `leg45-s-l` | 0.000 % | ? | 3790 | s? |
| `leg30-s-r` | 0.000 % | ? | 4378 | s? |
| `leg30-s` | 0.000 % | ? | 8264 | s? |
| `connector-flat-peg-5mm` | 0.000 % | ? | 4744 | s? |
| `connector-flat-peg` | 0.000 % | ? | 4834 | s? |
| `leg30-s-l` | 0.000 % | ? | 4378 | s? |
| `peg-cutout` | 0.000 % | ? | 572 | s? |

**Peor caso:** 0.061 %.

La malla adaptativa es la que usa la app cuando **Alta fidelidad** est? activo. La opci?n de loft 2D sigue disponible para edici?n r?pida.
