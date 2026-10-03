import { describe, it, expect } from 'vitest'
import { escapeHtml, safeCssColor, fieldPinHtml, farmPinHtml } from './pinIcons'

const ATTACK = '<img src=x onerror="alert(1)">'

describe('escapeHtml', () => {
  it('makes markup characters inert', () => {
    expect(escapeHtml(`<b>"a" & 'b'</b>`)).toBe('&lt;b&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/b&gt;')
  })

  it('leaves ordinary names alone', () => {
    expect(escapeHtml('Campo Ñandú 3 🐐')).toBe('Campo Ñandú 3 🐐')
  })
})

describe('safeCssColor', () => {
  it('passes the forms a color takes', () => {
    for (const color of ['#639922', '#fff', '#63992280', 'red', 'rgb(99, 153, 34)', 'hsla(90, 60%, 40%, 0.5)']) {
      expect(safeCssColor(color)).toBe(color)
    }
  })

  it('replaces anything else with neutral gray', () => {
    for (const color of [
      'red;background:url(http://example.com/x)',
      '#639922"><img src=x onerror=alert(1)>',
      'url(http://example.com/x)',
      'expression(alert(1))',
      '',
    ]) {
      expect(safeCssColor(color)).toBe('#6b7280')
    }
  })
})

describe('fieldPinHtml', () => {
  it('shows the field name and color', () => {
    const html = fieldPinHtml('#639922', 'Campo Norte')
    expect(html).toContain('>Campo Norte</div>')
    expect(html).toContain('border:1.5px solid #639922;')
    expect(html).toContain('fill="#639922"')
  })

  it('renders a name holding markup as text', () => {
    const html = fieldPinHtml('#639922', ATTACK)
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;')
  })

  it('does not let the color leave its attribute', () => {
    const html = fieldPinHtml(`red" onmouseover="alert(1)`, 'Campo')
    expect(html).not.toContain('onmouseover')
    expect(html).toContain('fill="#6b7280"')
  })
})

describe('farmPinHtml', () => {
  it('shows the farm name', () => {
    expect(farmPinHtml('Finca La Esperanza')).toContain('>Finca La Esperanza</div>')
  })

  it('renders a name holding markup as text', () => {
    const html = farmPinHtml(ATTACK)
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })
})
