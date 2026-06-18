// PROBLEM SOLVING GRAMMAR
ProblemSolvingIntent = confidence:Confidence _ cmd:SolveCommand _ {
  return { confidence, extracted: { action: 'problem_solving' } };
}
Confidence = 'why is' { return 0.85; }
           / 'what caused' { return 0.90; }
           / 'debug' { return 0.88; }
           / 'investigate' { return 0.85; }
           / 'fix' _ 'bug' { return 0.90; }
SolveCommand = 'why' _ 'is' _ 'the'? _ issue:IssuePhrase '?'? { return { action: 'debug' }; }
             / 'debug' _ issue:IssuePhrase { return { action: 'debug' }; }
IssuePhrase = [a-zA-Z0-9 ]+ { return text().trim(); }
_ = [ \t]*
