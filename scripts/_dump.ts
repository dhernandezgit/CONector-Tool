import { writeFileSync } from "node:fs";
import { CONNECTOR_PRESETS, presetSettings } from "../src/data/connectorPresets";
writeFileSync("preset-settings.json", JSON.stringify(CONNECTOR_PRESETS.map(p=>({id:p.id,name:p.name,group:p.group,settings:presetSettings(p)})),null,2));
