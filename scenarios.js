window.SALES_TL_SCENARIOS = [
  {
    id: "conversation-with-parents",
    title: "Conversation with parents",
    video: "assets/videos/When_do_I_need_to_make_a_decision.mp4",
    prompt:
      "What are your thoughts on this interaction? If you had to give one or two things that could improve, what would you suggest?",
    danResponse: [
      "Issues",
      "YES - \"The quicker the better\"",
      "HALF - Laughing - it's serious",
      "YES - \"Whenever you guys are comfortable\"",
      "YES - \"I'm holding his position... I can get you enrolled now if you want?\"",
      "YES - Closing steps - premature",
      "",
      "Better",
      "Tonight we discussed Jonny's challenges, including leaving things to the last minute and improving maths.",
      "He seems committed to getting better marks; he said it was a 9/10 to improve.",
      "It does feel like it is a good fit.",
      "Is it a priority for you to deal with these challenges and see an improvement?",
    ].join("\n"),
  },
  {
    id: "close-and-walkout",
    title: "Close & Walkout",
    video: "assets/videos/Do_you_want_to_move_forward.mp4",
    prompt:
      "What are your thoughts on this interaction? If you had to give one or two things that could improve, what would you suggest?",
    danResponse: [
      "Issues",
      "NO - \"How are you feeling about everything... do you want to move forward?\"",
      "NO - Walk out - no 99%",
      "",
      "Better",
      "Close with the student: Are you happy to make one small change? How do you feel about the program?",
      "Close with the parents: Mum & Dad - all good?",
      "Walkout line: \"I'm happy with whatever you want to do but just so you know...\"",
    ].join("\n"),
  },
  {
    id: "final-part-with-parents",
    title: "Final part with parents",
    video: "assets/videos/Any_other_questions.mp4",
    prompt:
      "What are your thoughts on this interaction? If you had to give one or two things that could improve, what would you suggest?",
    danResponse: [
      "Issue: Pink Elephant",
      "No - \"Any other questions?\"",
      "It creates uncertainty.",
    ].join("\n"),
  },
  {
    id: "closing-scenario",
    title: "Closing scenario",
    video: "assets/videos/Kane_-_think_about_it_1.mp4",
    prompt:
      "What are your thoughts on this interaction? If you had to give one or two things that could improve, what would you suggest?",
    danResponse: [
      "Client says: \"It's something that we can absolutely discuss\"",
      "Translation: I'm not sure. You still need to present the solution in a way that works for me.",
      "",
      "Consultant reply: Well what needs to happen from here is if you want to enrol we book in a welcome call.",
      "Translation: I know you're not sure but here are the details of signing up.",
      "",
      "The problem",
      "If someone is unsure of signing up, you don't provide the details of signing up. You first must get conceptual agreement to go ahead, then you get into the details.",
      "The real problem here is that the father is ironing in the background. The consultant needed to get him into the session, and not proceed until he was at the computer, or reschedule if necessary.",
    ].join("\n"),
  },
];
