// CONTEXT SYNTHESIS GRAMMAR
ContextSynthesisIntent = confidence:Confidence _ cmd:SynthesisCommand _ {
  return { confidence, extracted: { action: 'context_synthesis' } };
}
Confidence = 'pass this context' { return 0.95; }
           / 'synthesize' { return 0.90; }
           / 'inject' _ 'context' { return 0.88; }
           / 'summarize' _ 'for' _ 'agent' { return 0.85; }
SynthesisCommand = 'pass' _ 'this' _ 'context' { return { action: 'pass' }; }
                  / 'synthesize' _ 'context' { return { action: 'synthesize' }; }
_ = [ \t]*
