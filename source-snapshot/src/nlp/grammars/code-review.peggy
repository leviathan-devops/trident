// CODE REVIEW GRAMMAR
CodeReviewIntent = confidence:Confidence _ cmd:ReviewCommand _ target:TargetPath? _ {
  return { confidence, extracted: { action: 'code_review', targetPath: target || null } };
}
Confidence = 'audit' { return 0.95; }
           / 'code review' { return 0.90; }
           / 'static analysis' { return 0.88; }
           / 'security audit' { return 0.92; }
           / 'review' 'the'? 'code' { return 0.85; }
ReviewCommand = 'audit' _ path:Path { return { action: 'audit', path: path }; }
              / 'review' _ path:Path { return { action: 'review', path: path }; }
              / 'analyze' _ path:Path { return { action: 'analyze', path: path }; }
Path = '/' [a-zA-Z0-9_./\-\u0020]+ { return text(); }
TargetPath = 'at' _ path:Path { return path; }
           / 'for' _ path:Path { return path; }
_ = [ \t]*
