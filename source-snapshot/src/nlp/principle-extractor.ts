import winkNLP from 'wink-nlp';
import model from 'wink-eng-lite-web-model';

const nlp = winkNLP(model);

interface ExtractedPrinciple {
  name: string;
  statement: string;
  constraints: string[];
  successCriteria: string[];
}

export function extractPrinciplesFromText(text: string): ExtractedPrinciple[] {
  const doc = nlp.readDoc(text);
  const sentences: string[] = doc.sentences().out() as unknown as string[];
  const principles: ExtractedPrinciple[] = [];

  for (const sentence of sentences) {
    const sentDoc = nlp.readDoc(sentence);
    const tokens: string[] = sentDoc.tokens().out() as unknown as string[];
    const posTags: string[] = sentDoc.tokens().out((t: unknown) => (t as { pos: () => string }).pos()) as unknown as string[];

    const modalIndex = tokens.findIndex((t: string) =>
      ['must', 'should', 'shall', 'will', 'need', 'required'].includes(t.toLowerCase())
    );

    if (modalIndex >= 0) {
      const subject = tokens.slice(0, modalIndex).join(' ');
      const predicate = tokens.slice(modalIndex + 1).join(' ');

      principles.push({
        name: `Principle ${principles.length + 1}: ${subject}`,
        statement: sentence,
        constraints: [],
        successCriteria: [`${subject} ${predicate}`],
      });
    }
  }

  if (principles.length < 3) {
    for (const sentence of sentences) {
      const sentDoc2 = nlp.readDoc(sentence);
      const posTags2: string[] = sentDoc2.tokens().out((t: unknown) => (t as { pos: () => string }).pos()) as unknown as string[];

      const hasNoun = posTags2.some((t: string) => t.startsWith('NN'));
      const hasVerb = posTags2.some((t: string) => t.startsWith('VB'));

      if (hasNoun && hasVerb && principles.length < 5) {
        principles.push({
          name: `Principle ${principles.length + 1}`,
          statement: sentence,
          constraints: [],
          successCriteria: [sentence],
        });
      }
    }
  }

  return principles;
}
