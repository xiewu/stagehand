import { DomChunk } from "./DomChunk";
import { collectCandidateElements } from "./candidateCollector";
import { StagehandContainer } from "@/lib/dom/StagehandContainer";

export async function collectDomChunksShared(
  container: StagehandContainer,
  startOffset: number,
  endOffset: number,
  chunkSize: number,
  scrollBackToTop = true,
  candidateContainer?: HTMLElement,
): Promise<DomChunk[]> {
  const chunks: DomChunk[] = [];
  const maxOffset = container.getScrollHeight() - container.getViewportHeight();
  const finalEnd = Math.min(endOffset, maxOffset);
  let index = 0;

  for (let current = startOffset; current <= finalEnd; current += chunkSize) {
    await container.scrollTo(current);

    const root = candidateContainer || container.getRootElement();
    const { outputString, selectorMap } = await collectCandidateElements(
      root as HTMLElement,
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
    await container.scrollTo(0);
  }

  return chunks;
}
