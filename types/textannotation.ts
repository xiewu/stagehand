export type TextAnnotation = {
  text: string;
  midpoint: { x: number; y: number };
  midpoint_normalized: { x: number; y: number };
  width: number;
  height: number;
}