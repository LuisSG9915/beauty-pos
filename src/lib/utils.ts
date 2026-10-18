import { createCn } from "cn/config"

// `text-op-xs`/`text-op-sm` son font-sizes del @theme (13/14px), pero el motor
// de merge las clasifica como color: al fusionar con un variant eliminaría su
// `text-primary-foreground` y el botón quedaría sin contraste AA. Se declaran
// aquí para que el merge las trate como tamaño.
export const cn = createCn({
  extend: { classGroups: { "font-size": [{ text: ["op-xs", "op-sm"] }] } },
})
