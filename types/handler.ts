interface PageExtractionTarget {
  scope: "page";
}

interface ElementExtractionTarget {
  scope: "element";
  xpath: string;
}

export type ExtractionTarget = PageExtractionTarget | ElementExtractionTarget;
