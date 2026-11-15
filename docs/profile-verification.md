# Verificaci?n de los perfiles param?tricos

Modelo: loft de secciones 2D de `conectors/profiles.json`. No se carga ninguna malla 3D.

M?trica: distancia punto-superficie sim?trica (media en ambos sentidos), dividida por la diagonal de la envolvente. Envolvente: diferencia m?xima de dimensiones en mm.

| Preset | Error de superficie | Error de envolvente | Estanca |
| --- | ---: | ---: | :---: |
| `angled45-r` | 0.407 % | 0.000 mm | s? |
| `angled45-l` | 0.398 % | 0.000 mm | s? |
| `angled30-r` | 0.394 % | 0.000 mm | s? |
| `angled30-l` | 0.392 % | 0.000 mm | s? |
| `angled45` | 0.247 % | 0.000 mm | s? |
| `edge5-l-flipped` | 0.205 % | 0.000 mm | s? |
| `leg-connector-peg-5mm` | 0.191 % | 0.000 mm | s? |
| `edge5-l` | 0.183 % | 0.000 mm | s? |
| `leg-connector-peg` | 0.182 % | 0.000 mm | s? |
| `leg-connector` | 0.173 % | 0.000 mm | s? |
| `angled30` | 0.146 % | 0.000 mm | s? |
| `leg30-connector-peg-5mm` | 0.139 % | 0.000 mm | s? |
| `edge1-paw` | 0.138 % | 0.000 mm | s? |
| `leg30-connector-peg` | 0.136 % | 0.000 mm | s? |
| `leg30-connector` | 0.135 % | 0.000 mm | s? |
| `connector-flat-peg-5mm` | 0.129 % | 0.000 mm | s? |
| `connector-peg` | 0.121 % | 0.000 mm | s? |
| `connector-peg-5mm` | 0.117 % | 0.000 mm | s? |
| `connector-360` | 0.114 % | 0.000 mm | s? |
| `edge3-flat` | 0.113 % | 0.000 mm | s? |
| `edge1-boot` | 0.109 % | 0.000 mm | s? |
| `edge1` | 0.107 % | 0.000 mm | s? |
| `edge4-corner` | 0.107 % | 0.000 mm | s? |
| `edge3-corner` | 0.101 % | 0.000 mm | s? |
| `edge4-l` | 0.098 % | 0.000 mm | s? |
| `edge5-corner` | 0.093 % | 0.000 mm | s? |
| `edge4-l-flipped` | 0.093 % | 0.000 mm | s? |
| `edge7-corner` | 0.092 % | 0.000 mm | s? |
| `connector` | 0.091 % | 0.000 mm | s? |
| `edge2-corner` | 0.090 % | 0.000 mm | s? |
| `edge3-l` | 0.089 % | 0.000 mm | s? |
| `edge3-l-flipped` | 0.088 % | 0.000 mm | s? |
| `edge2-flat` | 0.088 % | 0.000 mm | s? |
| `edge4-flat` | 0.084 % | 0.000 mm | s? |
| `edge3-t` | 0.084 % | 0.000 mm | s? |
| `connector-flat-peg` | 0.081 % | 0.000 mm | s? |
| `peg-cutout` | 0.067 % | 0.000 mm | s? |
| `leg30-s` | 0.065 % | 0.000 mm | s? |
| `leg30-s-r` | 0.057 % | 0.000 mm | s? |
| `leg30-s-l` | 0.055 % | 0.000 mm | s? |
| `leg45-s-l` | 0.054 % | 0.000 mm | s? |
| `leg45-s` | 0.043 % | 0.000 mm | s? |
| `leg45-s-r` | 0.037 % | 0.000 mm | s? |

**Peor caso:** 0.407 % (`angled45-r`).

Los STL de referencia no se incluyen en el repositorio ni en la aplicaci?n; solo se usan localmente para medir la aproximaci?n.
