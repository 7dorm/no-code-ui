import { ElementClass } from './ElementBase';
import { Div } from './Div';
import { ButtonEl } from './Button';
import { ImageEl } from './Image';
import { LinkEl } from './Link';
import { H1,H2,H3,H4,H5,H6 } from './Heading';
import { Box } from './Box';
import { Text } from './Text';
import { Card } from './Card';

export const ELEMENT_REGISTRY: Record<string, ElementClass> = {
  [Div.kind]: Div,
  [ButtonEl.kind]: ButtonEl,
  [ImageEl.kind]: ImageEl,
  [LinkEl.kind]: LinkEl,
  [H1.kind]: H1, [H2.kind]: H2, [H3.kind]: H3, [H4.kind]: H4, [H5.kind]: H5, [H6.kind]: H6,
  [Box.kind]: Box,
  [Text.kind]: Text,
  [Card.kind]: Card
};
