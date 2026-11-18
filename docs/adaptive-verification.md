# Verificacion de la malla adaptativa

Modelo de alta fidelidad: superficie derivada simplificada y estanca. No se incluye ningun STL ni la malla de referencia original.

Metrica: distancia punto-superficie simetrica entre la malla adaptativa y la malla de referencia, dividida por la diagonal de la envolvente.

| Preset | Error de malla | Triangulos | Estanca |
| --- | ---: | ---: | :---: |
| `connector-360` | 0.061 % | 12000 | si |
| `edge7-corner` | 0.025 % | 10000 | si |
| `leg-connector-peg-5mm` | 0.021 % | 10000 | si |
| `leg-connector` | 0.021 % | 10000 | si |
| `angled30` | 0.017 % | 10000 | si |
| `angled45-l` | 0.015 % | 10000 | si |
| `leg-connector-peg` | 0.015 % | 10000 | si |
| `angled45` | 0.014 % | 10000 | si |
| `leg30-connector-peg-5mm` | 0.013 % | 10000 | si |
| `leg30-connector-peg` | 0.013 % | 10000 | si |
| `leg30-connector` | 0.011 % | 10000 | si |
| `edge5-l-flipped` | 0.011 % | 10000 | si |
| `edge5-corner` | 0.009 % | 10000 | si |
| `connector-peg` | 0.008 % | 10000 | si |
| `connector-peg-5mm` | 0.008 % | 10000 | si |
| `connector` | 0.007 % | 10000 | si |
| `edge3-l-flipped` | 0.006 % | 10000 | si |
| `angled45-r` | 0.006 % | 10000 | si |
| `angled30-l` | 0.005 % | 10000 | si |
| `edge4-l-flipped` | 0.005 % | 10000 | si |
| `edge3-l` | 0.005 % | 10000 | si |
| `angled30-r` | 0.005 % | 10000 | si |
| `edge5-l` | 0.004 % | 10000 | si |
| `edge4-corner` | 0.004 % | 10000 | si |
| `edge4-l` | 0.004 % | 10000 | si |
| `edge3-corner` | 0.004 % | 10000 | si |
| `edge3-t` | 0.003 % | 10000 | si |
| `edge2-corner` | 0.003 % | 10000 | si |
| `edge3-flat` | 0.002 % | 10000 | si |
| `edge4-flat` | 0.002 % | 10000 | si |
| `edge1-paw` | 0.001 % | 10000 | si |
| `edge2-flat` | 0.001 % | 10000 | si |
| `leg45-s-r` | 0.000 % | 3790 | si |
| `leg45-s` | 0.000 % | 7252 | si |
| `edge1` | 0.000 % | 9310 | si |
| `edge1-boot` | 0.000 % | 9300 | si |
| `leg45-s-l` | 0.000 % | 3790 | si |
| `leg30-s-r` | 0.000 % | 4378 | si |
| `leg30-s` | 0.000 % | 8264 | si |
| `connector-flat-peg-5mm` | 0.000 % | 4744 | si |
| `connector-flat-peg` | 0.000 % | 4834 | si |
| `leg30-s-l` | 0.000 % | 4378 | si |
| `peg-cutout` | 0.000 % | 572 | si |

**Peor caso:** 0.061 %.

La malla adaptativa es la que usa la app cuando **Alta fidelidad** esta activo. La opcion de loft 2D sigue disponible para edicion rapida.
