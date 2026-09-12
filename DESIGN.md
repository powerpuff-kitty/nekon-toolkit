# NEKON toolkit design guidance

Preserve the existing NEKON semantic token names and values, Geist-based font
stacks with local/system fallbacks, precise geometry and restrained accent use.
Do not invent a replacement palette while extracting the developer toolkit.
Consumers control their own brand, fonts and layouts.

The first public package exports variables only. No document reset, hidden font
request, logo URL, native-control color scheme or global focus rule is allowed in
token output. Scoped theme boundaries redeclare derived variables; custom seed
values should be set on the same theme element. Test custom contrast rather than
assuming the defaults or a token library confer accessibility.

Future UI needs visible keyboard focus, labels beyond color, reduced-motion,
forced-colors, RTL and state-specific examples. Encryption, verified identity,
authorization, connection and delivery state are distinct concepts. A decorative
lock or generated identity mark is not proof of trust or authority.

The static tokens example is a synthetic demonstration, not a messenger or an
accessibility certification. Figma/Storybook/component work remains in #9–#17.
