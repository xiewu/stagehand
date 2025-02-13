import { DomChunk } from "@/lib/dom/DomChunk";
import { collectCandidateElements } from "@/lib/dom/candidateCollector";

export abstract class StagehandContainer {
  public abstract getViewportHeight(): number;
  public abstract getScrollHeight(): number;
  public abstract scrollTo(offset: number): Promise<void>;
  public abstract getRootElement(): HTMLElement | Document;
  public abstract scrollIntoView(element?: HTMLElement): Promise<void>;
  public abstract getScrollPosition(): number;

  public async collectDomChunks(
    startOffset: number,
    endOffset: number,
    chunkSize: number,
    scrollBackToTop: boolean = true,
    candidateContainer?: HTMLElement,
  ): Promise<DomChunk[]> {
    const chunks: DomChunk[] = [];
    const maxOffset = this.getScrollHeight() - this.getViewportHeight();
    const finalEnd = Math.min(endOffset, maxOffset);
    let index = 0;

    for (let current = startOffset; current <= finalEnd; current += chunkSize) {
      await this.scrollTo(current);

      const rootCandidate =
        candidateContainer || (this.getRootElement() as HTMLElement);
      const { outputString, selectorMap } = await collectCandidateElements(
        rootCandidate,
        index,
      );

      chunks.push({
        startOffset: current,
        endOffset: current + chunkSize,
        outputString,
        selectorMap,
      });

      index += Object.keys(selectorMap).length;
    }

    if (scrollBackToTop) {
      await this.scrollTo(0);
    }

    return chunks;
  }
}
