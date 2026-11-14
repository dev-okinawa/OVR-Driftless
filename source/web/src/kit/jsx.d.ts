// JSX types of the design kit's custom elements, derived from the tag map the kit declares.
//
// React 19 sets a prop as a DOM property when the element has that property, and adds a prop named `on` + event
// name as an event listener for that exact name: `onui-change` listens to `ui-change`.
import type { CloseReason, DeviceSelectDetail, SeekDetail, ValueChangeDetail } from '@ai-designer/ui';
import type { LitElement } from 'lit';
import type { HTMLAttributes, ReactNode, RefAttributes } from 'react';

/** Events with a typed detail, per tag. Tags not listed here fire only `click` and native events. */
interface KitEventDetails {
  'ui-checkbox': { 'ui-change': ValueChangeDetail<boolean> };
  'ui-switch': { 'ui-change': ValueChangeDetail<boolean> };
  'ui-device-tile': { 'ui-select': DeviceSelectDetail };
  'ui-floating-panel': { 'ui-close': { readonly reason: 'button' | 'escape' } };
  'ui-dialog': { 'ui-close': { readonly reason: CloseReason } };
  'ui-segmented-control': { 'ui-change': ValueChangeDetail<string> };
  'ui-choice-group': { 'ui-change': ValueChangeDetail<string> };
  'ui-select': { 'ui-change': ValueChangeDetail<string> };
  'ui-text-field': { 'ui-change': ValueChangeDetail<string> };
  'ui-slider': { 'ui-input': ValueChangeDetail<number>; 'ui-change': ValueChangeDetail<number> };
  'ui-tabs': { 'ui-change': { readonly value: string } };
  'ui-alert': { 'ui-dismiss': Record<string, never> };
  'ui-time-chart': { 'ui-seek': SeekDetail };
}

type KitTag = Extract<keyof HTMLElementTagNameMap, `ui-${string}`>;

type EventProps<Tag extends KitTag> = Tag extends keyof KitEventDetails
  ? { [Name in keyof KitEventDetails[Tag] & string as `on${Name}`]?: (event: CustomEvent<KitEventDetails[Tag][Name]>) => void }
  : unknown;

/** The element's own public properties: everything it adds to a plain Lit element. */
type OwnProps<Element extends HTMLElement> = Partial<Omit<Element, keyof LitElement>>;

type KitProps<Tag extends KitTag> = OwnProps<HTMLElementTagNameMap[Tag]> &
  Omit<HTMLAttributes<HTMLElementTagNameMap[Tag]>, keyof OwnProps<HTMLElementTagNameMap[Tag]>> &
  RefAttributes<HTMLElementTagNameMap[Tag]> &
  EventProps<Tag> & { readonly slot?: string; readonly children?: ReactNode };

type KitIntrinsicElements = { [Tag in KitTag]: KitProps<Tag> };

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface IntrinsicElements extends KitIntrinsicElements {}
  }
}
