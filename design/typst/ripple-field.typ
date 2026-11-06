// Ripple's abstract identity field. Decorative artwork, never research data.
// Both exports share geometry; only the supplied palette changes.
// typst compile --input theme=light --format svg design/typst/ripple-field.typ frontend/public/art/ripple-field-light.svg
#let dark = sys.inputs.at("theme", default: "light") == "dark"
#let canvas = rgb(if dark { "#0C1417" } else { "#F6F4EF" })
#let surface = rgb(if dark { "#142226" } else { "#FFFFFF" })
#let action = rgb(if dark { "#8FD3E6" } else { "#0B5C73" })
#let ring = rgb(if dark { "#5FB7C2" } else { "#CFE8EA" })
#let matured = rgb(if dark { "#3E666E" } else { "#CBE4E2" })
#let eval = rgb(if dark { "#34565E" } else { "#DDECEB" })
#let raised = rgb(if dark { "#1B2E33" } else { "#EFECE4" })

#set page(width: 720pt, height: 520pt, margin: 0pt, fill: none)

// A single disturbance becomes a family of widening, tilted contours.
#for i in range(8) {
  let w = (650 - i * 42) * 1pt
  let h = (360 - i * 24) * 1pt
  place(center + horizon, dx: 22pt, dy: -14pt,
    rotate(-28deg, ellipse(width: w, height: h,
      stroke: (paint: ring, thickness: if calc.rem(i, 3) == 0 { 1.1pt } else { 0.55pt }),
    )))
}

// Offset solid strata give the field depth without gradients or raster images.
#for (i, color) in (action, matured, eval, ring, surface).enumerate() {
  place(center + horizon, dx: 22pt, dy: (22 - i * 7) * 1pt,
    rotate(-28deg, ellipse(width: (386 - i * 28) * 1pt,
      height: (211 - i * 17) * 1pt,
      fill: color, stroke: none,
    )))
}
#place(center + horizon, dx: 22pt, dy: -14pt,
  rotate(-28deg, ellipse(width: 200pt, height: 100pt,
    fill: canvas, stroke: (paint: ring, thickness: 1pt),
  )))
#place(center + horizon, dx: 22pt, dy: -14pt,
  rotate(-28deg, ellipse(width: 153pt, height: 73pt,
    stroke: (paint: matured, thickness: 0.7pt),
  )))

// Boundary through the open water: motif shared with the Ripple mark.
#place(top + left, curve(stroke: (paint: action, thickness: 1pt, dash: "dashed"),
  curve.move((126pt, 379pt)), curve.line((601pt, 120pt)),
))
#place(top + left, dx: 377pt, dy: 243pt,
  circle(radius: 6pt, fill: action, stroke: (paint: surface, thickness: 3pt)))
#place(top + left, dx: 570pt, dy: 118pt,
  circle(radius: 4pt, fill: surface, stroke: (paint: action, thickness: 1pt)))

// A cropped wave at the foot grounds the orbit in the page's water palette.
#place(top + left, curve(fill: eval, stroke: none,
  curve.move((0pt, 505pt)),
  curve.cubic((135pt, 500pt), (171pt, 393pt), (320pt, 417pt)),
  curve.cubic((489pt, 446pt), (548pt, 360pt), (720pt, 335pt)),
  curve.line((720pt, 520pt)), curve.line((0pt, 520pt)), curve.close(mode: "straight"),
))
#place(top + left, curve(fill: matured, stroke: none,
  curve.move((140pt, 520pt)),
  curve.cubic((315pt, 409pt), (370pt, 499pt), (495pt, 454pt)),
  curve.cubic((610pt, 413pt), (629pt, 384pt), (720pt, 387pt)),
  curve.line((720pt, 520pt)), curve.close(mode: "straight"),
))
#place(top + left, curve(fill: action, stroke: none,
  curve.move((339pt, 520pt)),
  curve.cubic((473pt, 439pt), (571pt, 520pt), (720pt, 435pt)),
  curve.line((720pt, 520pt)), curve.close(mode: "straight"),
))
