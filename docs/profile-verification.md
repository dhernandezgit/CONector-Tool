# Verificaci?n de los perfiles param?tricos

Modelo: loft de secciones 2D de `conectors/profiles.json`. No se carga ninguna malla 3D.

M?trica: distancia punto-superficie sim?trica (media en ambos sentidos), dividida por la diagonal de la envolvente de referencia. Envolvente: diferencia m?xima de dimensiones en mm.

| Preset | Error de superficie | Error de envolvente | Estanca |
| --- | ---: | ---: | :---: |
| `angled45-l` | 0.420 % | 0.000 mm | s? |
| `angled45-r` | 0.412 % | 0.000 mm | s? |
| `angled30-l` | 0.405 % | 0.000 mm | s? |
| `angled30-r` | 0.400 % | 0.000 mm | s? |
| `angled45` | 0.253 % | 0.000 mm | s? |
| `edge5-l-flipped` | 0.219 % | 0.000 mm | s? |
| `edge5-l` | 0.209 % | 0.000 mm | s? |
| `leg-connector-peg` | 0.186 % | 0.000 mm | s? |
| `angled30` | 0.186 % | 0.000 mm | s? |
| `leg-connector-peg-5mm` | 0.175 % | 0.000 mm | s? |
| `leg-connector` | 0.174 % | 0.000 mm | s? |
| `connector-360` | 0.164 % | 0.000 mm | s? |
| `connector-peg-5mm` | 0.142 % | 0.000 mm | s? |
| `connector-peg` | 0.142 % | 0.000 mm | s? |
| `edge1-paw` | 0.136 % | 0.000 mm | s? |
| `leg30-connector` | 0.134 % | 0.000 mm | s? |
| `leg30-connector-peg` | 0.134 % | 0.000 mm | s? |
| `edge3-corner` | 0.134 % | 0.000 mm | s? |
| `leg30-connector-peg-5mm` | 0.133 % | 0.000 mm | s? |
| `edge4-corner` | 0.131 % | 0.000 mm | s? |
| `edge5-corner` | 0.128 % | 0.000 mm | s? |
| `edge3-flat` | 0.127 % | 0.000 mm | s? |
| `edge7-corner` | 0.123 % | 0.000 mm | s? |
| `edge1` | 0.122 % | 0.000 mm | s? |
| `connector` | 0.121 % | 0.000 mm | s? |
| `edge3-l-flipped` | 0.121 % | 0.000 mm | s? |
| `edge1-boot` | 0.117 % | 0.000 mm | s? |
| `edge3-l` | 0.116 % | 0.000 mm | s? |
| `edge4-l-flipped` | 0.114 % | 0.000 mm | s? |
| `edge4-l` | 0.113 % | 0.000 mm | s? |
| `connector-flat-peg-5mm` | 0.108 % | 0.000 mm | s? |
| `edge2-corner` | 0.102 % | 0.000 mm | s? |
| `edge2-flat` | 0.100 % | 0.000 mm | s? |
| `edge3-t` | 0.099 % | 0.000 mm | s? |
| `edge4-flat` | 0.085 % | 0.000 mm | s? |
| `connector-flat-peg` | 0.081 % | 0.000 mm | s? |
| `peg-cutout` | 0.068 % | 0.000 mm | s? |
| `leg30-s` | 0.067 % | 0.000 mm | s? |
| `leg45-s` | 0.058 % | 0.000 mm | s? |
| `leg30-s-r` | 0.056 % | 0.000 mm | s? |
| `leg30-s-l` | 0.054 % | 0.000 mm | s? |
| `leg45-s-l` | 0.054 % | 0.000 mm | s? |
| `leg45-s-r` | 0.052 % | 0.000 mm | s? |

**Peor caso:** 0.420 % (`angled45-l`).

Los STL de referencia no se incluyen en el repositorio; esta tabla se obtiene con `scripts/verify_reference_profiles.py` apuntando a los bundles locales.
