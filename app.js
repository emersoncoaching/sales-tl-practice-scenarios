(function () {
  const scenarios = window.SALES_TL_SCENARIOS || [];
  const config = window.SALES_TL_CONFIG || {};
  const app = document.querySelector("#app");
  const statusPill = document.querySelector("#status-pill");
  const draftKey = "sales-tl-scenarios-draft-v1";
  const privateAccessKey = "sales-tl-private-access-v1";

  const state = {
    applicant: loadDraft().applicant || {
      name: getParam("name") || "",
      email: getParam("email") || "",
      starhireCandidateId: getParam("starhire_id") || "",
    },
    answers: loadDraft().answers || {},
    index: 0,
    isSubmitting: false,
  };

  const isConfigured =
    Boolean(config.supabaseUrl) &&
    Boolean(config.supabaseAnonKey) &&
    !config.supabaseAnonKey.includes("PASTE_");

  const supabaseClient =
    isConfigured && window.supabase
      ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey)
      : null;

  init();

  function init() {
    const adminToken = getParam("admin");
    const reviewToken = getParam("review");
    const receiptToken = getParam("receipt");

    if (adminToken) {
      renderPrivateAccessGate("Private dashboard", () => renderAdminDashboard(adminToken));
      return;
    }

    if (reviewToken) {
      renderPrivateAccessGate("Private review", () => renderReview(reviewToken));
      return;
    }

    if (receiptToken) {
      renderReceipt(receiptToken);
      return;
    }

    renderStart();
  }

  function renderStart() {
    setStatus("Practice task");
    app.innerHTML = `
      <section class="start-layout">
        <form class="panel start-panel" id="start-form">
          <div class="start-heading">
            <h2>Give feedback on four short scenarios</h2>
            ${configWarning()}
          </div>
          <div class="start-fields">
            <div class="field">
              <label for="name">Name</label>
              <input id="name" name="name" autocomplete="name" required value="${escapeAttr(state.applicant.name)}">
            </div>
            <div class="field">
              <label for="email">Email</label>
              <input id="email" name="email" type="email" autocomplete="email" required value="${escapeAttr(state.applicant.email)}">
            </div>
          </div>
          <div class="actions start-actions">
            <button class="primary" type="submit">Start scenarios</button>
          </div>
        </form>
      </section>
    `;

    document.querySelector("#start-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      state.applicant.name = String(form.get("name") || "").trim();
      state.applicant.email = String(form.get("email") || "").trim();

      if (!state.applicant.name || !isEmail(state.applicant.email)) {
        showInlineError(event.currentTarget, "Please enter your name and a valid email.");
        return;
      }

      saveDraft();
      renderScenario(0);
    });
  }

  function renderScenario(index) {
    state.index = index;
    const scenario = scenarios[index];
    if (!scenario) {
      renderSubmit();
      return;
    }

    setStatus(`Scenario ${index + 1} of ${scenarios.length}`);
    app.innerHTML = `
      <section class="scenario-grid">
        <aside>
          <p class="eyebrow">Progress</p>
          <ol class="progress-list">
            ${scenarios
              .map((item, itemIndex) => {
                const stateClass =
                  itemIndex === index ? "is-active" : itemIndex < index ? "is-complete" : "";
                return `
                  <li class="progress-item ${stateClass}">
                    <span class="progress-number">${itemIndex + 1}</span>
                    <span>${escapeHtml(item.title)}</span>
                  </li>
                `;
              })
              .join("")}
          </ol>
        </aside>

        <article class="panel scenario-panel">
          <div class="video-wrap">
            <video controls preload="metadata" src="${escapeAttr(scenario.video)}"></video>
          </div>
          <div class="scenario-body">
            <p class="eyebrow">Scenario ${index + 1}</p>
            <h2>${escapeHtml(scenario.title)}</h2>
            <p class="prompt">${escapeHtml(scenario.prompt)}</p>
            <div class="field-label" id="answer-label">Your response</div>
            <div class="rich-editor-shell">
              <div class="rich-toolbar" role="toolbar" aria-label="Formatting tools">
                <button class="tool-button" type="button" data-command="bold" aria-label="Bold" title="Bold"><strong>B</strong></button>
                <button class="tool-button" type="button" data-command="italic" aria-label="Italic" title="Italic"><em>I</em></button>
                <button class="tool-button" type="button" data-command="insertUnorderedList" aria-label="Bullet list" title="Bullet list"><span aria-hidden="true">&bull;</span></button>
                <button class="tool-button" type="button" data-command="insertOrderedList" aria-label="Numbered list" title="Numbered list"><span aria-hidden="true">1.</span></button>
              </div>
              <div
                class="rich-editor"
                id="answer"
                contenteditable="true"
                role="textbox"
                aria-labelledby="answer-label"
                aria-multiline="true"
                spellcheck="true"
                data-placeholder="Write your feedback here..."
              >${getAnswerHtml(scenario.id)}</div>
            </div>
            <div class="actions">
              ${
                index > 0
                  ? '<button class="secondary" type="button" id="back-button">Back</button>'
                  : ""
              }
              <button class="primary" type="button" id="next-button">${
                index === scenarios.length - 1 ? "Review answers" : "Next scenario"
              }</button>
            </div>
          </div>
        </article>
      </section>
    `;

    const editor = document.querySelector("#answer");
    const updateAnswer = () => {
      state.answers[scenario.id] = sanitizeRichHtml(editor.innerHTML);
      saveDraft();
    };
    wireRichEditor(editor, updateAnswer);
    updateAnswer();

    const back = document.querySelector("#back-button");
    if (back) {
      back.addEventListener("click", () => renderScenario(index - 1));
    }

    document.querySelector("#next-button").addEventListener("click", () => {
      updateAnswer();
      if (!richTextToPlainText(state.answers[scenario.id]).trim()) {
        showInlineError(document.querySelector(".scenario-body"), "Please write a response before continuing.");
        editor.focus();
        return;
      }
      renderScenario(index + 1);
    });
  }

  function renderSubmit() {
    setStatus("Ready to submit");
    app.innerHTML = `
      <section class="receipt-grid">
        <aside>
          <p class="eyebrow">Final check</p>
          <h2>Submit when your answers are ready.</h2>
          <p class="lede">After submission, this response is final.</p>
        </aside>
        <div class="review-surface">
          <div class="receipt-list">
            ${scenarios
              .map(
                (scenario, index) => `
                <section class="receipt-item">
                  <p class="eyebrow">Scenario ${index + 1}</p>
                  <h3>${escapeHtml(scenario.title)}</h3>
                  ${answerBoxMarkup("Your response", getAnswerHtml(scenario.id))}
                  <button class="text-button" type="button" data-edit="${index}">Edit this response</button>
                </section>
              `
              )
              .join("")}
          </div>
          <div class="actions">
            <button class="secondary" type="button" id="back-to-last">Back</button>
            <button class="primary" type="button" id="submit-button">Submit responses</button>
          </div>
          <div id="submit-message"></div>
        </div>
      </section>
    `;

    document.querySelectorAll("[data-edit]").forEach((button) => {
      button.addEventListener("click", () => renderScenario(Number(button.dataset.edit)));
    });
    document.querySelector("#back-to-last").addEventListener("click", () => renderScenario(scenarios.length - 1));
    document.querySelector("#submit-button").addEventListener("click", submitResponses);
  }

  async function submitResponses() {
    if (state.isSubmitting) return;
    state.isSubmitting = true;
    const button = document.querySelector("#submit-button");
    const message = document.querySelector("#submit-message");
    button.disabled = true;
    button.textContent = "Submitting...";
    message.innerHTML = "";

    try {
      const responses = {
        scenarioVersion: "2026-06-v1",
        answers: scenarios.map((scenario) => {
          const answerHtml = getAnswerHtml(scenario.id);
          return {
            id: scenario.id,
            title: scenario.title,
            prompt: scenario.prompt,
            answer: richTextToPlainText(answerHtml),
            answerHtml,
          };
        }),
      };

      const result = isConfigured
        ? await submitToSupabase(responses)
        : await submitInDemoMode(responses);

      localStorage.removeItem(draftKey);
      renderThanks(result);
    } catch (error) {
      message.innerHTML = `<p class="error">${escapeHtml(error.message || "Something went wrong. Please try again.")}</p>`;
      button.disabled = false;
      button.textContent = "Submit responses";
    } finally {
      state.isSubmitting = false;
    }
  }

  async function submitToSupabase(responses) {
    const { data, error } = await supabaseClient.rpc("submit_sales_tl_scenario", {
      p_candidate_name: state.applicant.name,
      p_candidate_email: state.applicant.email,
      p_responses: responses,
      p_starhire_candidate_id: state.applicant.starhireCandidateId || null,
      p_user_agent: navigator.userAgent,
    });

    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("Submission was not returned by Supabase.");

    const urls = buildUrls(row.applicant_token, row.review_token);

    return {
      ...urls,
      submittedAt: row.created_at,
    };
  }

  async function submitInDemoMode(responses) {
    const applicantToken = crypto.randomUUID();
    const reviewToken = crypto.randomUUID();
    const urls = buildUrls(applicantToken, reviewToken);
    const demoSubmission = {
      candidate_name: state.applicant.name,
      candidate_email: state.applicant.email,
      created_at: new Date().toISOString(),
      review_status: "open",
      reviewed_at: null,
      responses,
      applicant_token: applicantToken,
      review_token: reviewToken,
    };
    localStorage.setItem(`demo-receipt-${applicantToken}`, JSON.stringify(demoSubmission));
    localStorage.setItem(`demo-review-${reviewToken}`, JSON.stringify(demoSubmission));
    saveDemoAdminSubmission(demoSubmission);
    await wait(350);
    return {
      ...urls,
      submittedAt: demoSubmission.created_at,
    };
  }

  function renderThanks(result) {
    setStatus("Submitted");
    app.innerHTML = `
      <section class="intro-grid">
        <div class="intro-copy">
          <p class="eyebrow">Submitted</p>
          <h2>Thank you. Please save this URL.</h2>
          <p class="lede">We will discuss this further during the hiring process.</p>
          <p class="success-note">Your response has been saved.</p>
        </div>
        <div class="review-surface">
          <div class="url-box">
            <label for="receipt-url">Your saved response URL</label>
            <input id="receipt-url" value="${escapeAttr(result.applicantUrl)}" readonly>
          </div>
          <div class="actions">
            <button class="secondary" type="button" id="copy-url">Copy URL</button>
            <a class="primary" href="${escapeAttr(result.applicantUrl)}">Open saved response</a>
          </div>
        </div>
      </section>
    `;

    document.querySelector("#copy-url").addEventListener("click", async () => {
      await navigator.clipboard.writeText(result.applicantUrl);
      document.querySelector("#copy-url").textContent = "Copied";
    });
  }

  function renderPrivateAccessGate(statusText, onUnlocked) {
    if (!config.privateAccessPasswordHash || hasPrivateAccess()) {
      onUnlocked();
      return;
    }

    setStatus("Private access");
    app.innerHTML = `
      <section class="access-layout">
        <form class="panel access-panel" id="private-access-form">
          <div>
            <p class="eyebrow">${escapeHtml(statusText)}</p>
            <h2>Enter password</h2>
            <p class="hint">You only need to enter this once on this browser.</p>
          </div>
          <div class="field">
            <label for="private-password">Password</label>
            <input id="private-password" name="password" type="password" autocomplete="current-password" required autofocus>
          </div>
          <div class="actions">
            <button class="primary" type="submit">Unlock</button>
          </div>
        </form>
      </section>
    `;

    const form = document.querySelector("#private-access-form");
    const password = document.querySelector("#private-password");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = form.querySelector("button");
      button.disabled = true;
      button.textContent = "Checking...";

      try {
        const enteredHash = await sha256(String(password.value || ""));
        if (enteredHash !== config.privateAccessPasswordHash) {
          throw new Error("Password not recognised.");
        }
        localStorage.setItem(privateAccessKey, enteredHash);
        onUnlocked();
      } catch (error) {
        showInlineError(form, error.message || "Password not recognised.");
        button.disabled = false;
        button.textContent = "Unlock";
        password.select();
      }
    });
  }

  async function renderAdminDashboard(token) {
    setStatus("Private dashboard");
    app.innerHTML = `
      <section class="admin-grid">
        <div class="intro-copy">
          <p class="eyebrow">Private dashboard</p>
          <h2>Sales TL scenario responses</h2>
          <p class="lede">Bookmark this page. New submissions appear here after refresh.</p>
        </div>
        <div class="panel form-panel">
          <p class="hint">Loading submissions...</p>
        </div>
      </section>
    `;

    try {
      const submissions = isConfigured ? await fetchAdminSubmissions(token) : fetchDemoAdminSubmissions();
      app.innerHTML = adminDashboardMarkup(submissions, token);
      wireAdminDashboard(token);
    } catch (error) {
      renderError("Dashboard unavailable", adminErrorMessage(error), "Dashboard issue");
    }
  }

  async function renderReceipt(token) {
    setStatus("Saved response");
    try {
      const submission = isConfigured
        ? await fetchApplicantSubmission(token)
        : JSON.parse(localStorage.getItem(`demo-receipt-${token}`) || "null");

      if (!submission) throw new Error("Saved response not found.");
      app.innerHTML = receiptMarkup(submission, false);
    } catch (error) {
      renderError("Saved response not found", error.message);
    }
  }

  async function renderReview(token) {
    setStatus("Private review");
    try {
      const submission = isConfigured
        ? await fetchReviewSubmission(token)
        : JSON.parse(localStorage.getItem(`demo-review-${token}`) || "null");

      if (!submission) throw new Error("Review response not found.");
      app.innerHTML = receiptMarkup(submission, true, token);
      wireReviewDecision(token);
    } catch (error) {
      renderError("Review response not found", error.message);
    }
  }

  async function fetchApplicantSubmission(token) {
    const { data, error } = await supabaseClient.rpc("get_sales_tl_submission_for_applicant", {
      p_applicant_token: token,
    });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  }

  async function fetchReviewSubmission(token) {
    const { data, error } = await supabaseClient.rpc("get_sales_tl_submission_for_review", {
      p_review_token: token,
    });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  }

  async function fetchAdminSubmissions(token) {
    const { data, error } = await supabaseClient.rpc("get_sales_tl_submissions_for_admin", {
      p_admin_token: token,
      p_limit: 100,
    });
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  async function updateReviewStatus(token, reviewStatus) {
    const normalizedStatus = normalizeReviewStatus(reviewStatus);

    if (isConfigured) {
      const { data, error } = await supabaseClient.rpc("set_sales_tl_submission_review_status", {
        p_review_token: token,
        p_review_status: normalizedStatus,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error("Review response not found.");
      return row;
    }

    const submission = JSON.parse(localStorage.getItem(`demo-review-${token}`) || "null");
    if (!submission) throw new Error("Review response not found.");

    const updatedSubmission = {
      ...submission,
      review_status: normalizedStatus,
      reviewed_at: normalizedStatus === "open" ? null : new Date().toISOString(),
    };

    localStorage.setItem(`demo-review-${token}`, JSON.stringify(updatedSubmission));
    if (updatedSubmission.applicant_token) {
      const receipt = JSON.parse(localStorage.getItem(`demo-receipt-${updatedSubmission.applicant_token}`) || "null");
      if (receipt) {
        localStorage.setItem(
          `demo-receipt-${updatedSubmission.applicant_token}`,
          JSON.stringify({
            ...receipt,
            review_status: updatedSubmission.review_status,
            reviewed_at: updatedSubmission.reviewed_at,
          })
        );
      }
    }
    saveDemoAdminSubmission(updatedSubmission);
    await wait(250);
    return updatedSubmission;
  }

  function adminDashboardMarkup(submissions, token) {
    const sortedSubmissions = submissions
      .slice()
      .sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0));
    const latestSubmission = sortedSubmissions[0];
    const groupedSubmissions = groupSubmissionsByReviewStatus(sortedSubmissions);

    return `
      <section class="admin-grid">
        <aside class="admin-sidebar">
          <p class="eyebrow">Private dashboard</p>
          <h2>Sales TL scenario responses</h2>
          <p class="lede">Bookmark this page. New submissions appear here after refresh.</p>
          <div class="actions">
            <button class="secondary" type="button" id="refresh-dashboard">Refresh</button>
          </div>
        </aside>
        <div class="dashboard-stack">
          <div class="dashboard-summary">
            <div>
              <span class="summary-number">${groupedSubmissions.open.length}</span>
              <span class="summary-label">open</span>
            </div>
            <div>
              <span class="summary-number">${groupedSubmissions.accepted.length}</span>
              <span class="summary-label">accepted</span>
            </div>
            <div>
              <span class="summary-number">${groupedSubmissions.rejected.length}</span>
              <span class="summary-label">rejected</span>
            </div>
            <div>
              <span class="summary-label">Latest</span>
              <span class="summary-detail">${
                latestSubmission ? escapeHtml(formatDate(latestSubmission.created_at)) : "No submissions yet"
              }</span>
            </div>
          </div>
          ${
            sortedSubmissions.length
              ? `<div class="dashboard-sections">
                  ${dashboardStatusSectionMarkup("open", groupedSubmissions.open)}
                  ${dashboardStatusSectionMarkup("accepted", groupedSubmissions.accepted)}
                  ${dashboardStatusSectionMarkup("rejected", groupedSubmissions.rejected)}
                </div>`
              : emptyDashboardMarkup()
          }
        </div>
      </section>
    `;
  }

  function groupSubmissionsByReviewStatus(submissions) {
    return submissions.reduce(
      (groups, submission) => {
        groups[normalizeReviewStatus(submission.review_status)].push(submission);
        return groups;
      },
      { open: [], accepted: [], rejected: [] }
    );
  }

  function dashboardStatusSectionMarkup(status, submissions) {
    const meta = reviewStatusMeta(status);
    return `
      <section class="submission-section submission-section-${status}">
        <header class="submission-section-header">
          <div>
            <h3>${escapeHtml(meta.sectionTitle)}</h3>
            <p>${escapeHtml(meta.sectionHint)}</p>
          </div>
          <span class="section-count">${submissions.length}</span>
        </header>
        ${
          submissions.length
            ? `<div class="submission-list">${submissions.map(adminSubmissionCardMarkup).join("")}</div>`
            : `<p class="section-empty">${escapeHtml(meta.emptyText)}</p>`
        }
      </section>
    `;
  }

  function adminSubmissionCardMarkup(submission) {
    const urls = buildUrls(submission.applicant_token, submission.review_token);
    const responses = normalizeResponses(submission.responses);
    const reviewStatus = normalizeReviewStatus(submission.review_status);
    const statusMeta = reviewStatusMeta(reviewStatus);
    const answeredCount = responses.filter((response) =>
      richTextToPlainText(response.answerHtml || plainTextToHtml(response.answer || "")).trim()
    ).length;

    return `
      <article class="submission-card">
        <div class="submission-top">
          <div>
            <h3>${escapeHtml(submission.candidate_name || "Applicant")}</h3>
            <p class="submission-email">${escapeHtml(submission.candidate_email || "")}</p>
          </div>
          <div class="submission-card-status">
            <span class="status-badge status-${reviewStatus}">${escapeHtml(statusMeta.label)}</span>
            <span class="submission-date">${escapeHtml(formatDate(submission.created_at))}</span>
          </div>
        </div>
        <div class="submission-meta">
          <span>${answeredCount} of ${scenarios.length} responses</span>
          ${
            reviewStatus !== "open" && submission.reviewed_at
              ? `<span>${escapeHtml(statusMeta.label)} ${escapeHtml(formatDate(submission.reviewed_at))}</span>`
              : ""
          }
          ${
            submission.starhire_candidate_id
              ? `<span>StarHire ID ${escapeHtml(submission.starhire_candidate_id)}</span>`
              : ""
          }
        </div>
        <div class="submission-actions">
          <a class="primary" href="${escapeAttr(urls.reviewUrl)}" target="_blank" rel="noopener">Open review</a>
          <a class="secondary" href="${escapeAttr(urls.applicantUrl)}" target="_blank" rel="noopener">Applicant URL</a>
          <button class="text-button copy-link" type="button" data-copy-url="${escapeAttr(urls.reviewUrl)}">Copy review link</button>
        </div>
      </article>
    `;
  }

  function emptyDashboardMarkup() {
    return `
      <div class="empty-dashboard">
        <h3>No submissions yet</h3>
        <p class="hint">When an applicant submits their responses, they will appear here with review and applicant links.</p>
      </div>
    `;
  }

  function wireAdminDashboard(token) {
    const refreshButton = document.querySelector("#refresh-dashboard");
    if (refreshButton) {
      refreshButton.addEventListener("click", () => renderAdminDashboard(token));
    }

    document.querySelectorAll("[data-copy-url]").forEach((button) => {
      button.addEventListener("click", async () => {
        await navigator.clipboard.writeText(button.dataset.copyUrl);
        button.textContent = "Copied";
      });
    });
  }

  function receiptMarkup(submission, includeDanResponses, reviewToken = "") {
    const responses = normalizeResponses(submission.responses);
    return `
      <section class="${includeDanResponses ? "review-grid" : "receipt-grid"}">
        <aside>
          <p class="eyebrow">${includeDanResponses ? "Review" : "Saved response"}</p>
          <h2>${escapeHtml(submission.candidate_name || "Applicant")}</h2>
          ${
            includeDanResponses && submission.candidate_email
              ? `<p class="lede">${escapeHtml(submission.candidate_email)}</p>`
              : ""
          }
          <p class="hint">Submitted ${formatDate(submission.created_at)}</p>
          ${includeDanResponses ? reviewDecisionMarkup(submission, reviewToken) : ""}
        </aside>
        <div class="panel form-panel">
          <div class="${includeDanResponses ? "review-list" : "receipt-list"}">
            ${responses
              .map((response, index) => {
                const scenario = scenarios.find((item) => item.id === response.id) || scenarios[index] || {};
                return `
                  <section class="review-scenario">
                    <p class="eyebrow">Scenario ${index + 1}</p>
                    <h3>${escapeHtml(response.title || scenario.title || "Scenario")}</h3>
                    <div class="video-wrap">
                      <video controls preload="metadata" src="${escapeAttr(scenario.video || "")}"></video>
                    </div>
                    ${
                      includeDanResponses
                        ? `<div class="comparison">
                            ${answerBoxMarkup(
                              "Applicant response",
                              response.answerHtml || plainTextToHtml(response.answer || "")
                            )}
                            ${answerBoxMarkup("Dan response", plainTextToHtml(scenario.danResponse || ""))}
                          </div>`
                        : answerBoxMarkup("Your response", response.answerHtml || plainTextToHtml(response.answer || ""))
                    }
                  </section>
                `;
              })
              .join("")}
          </div>
        </div>
      </section>
    `;
  }

  function reviewDecisionMarkup(submission, reviewToken) {
    const reviewStatus = normalizeReviewStatus(submission.review_status);
    const meta = reviewStatusMeta(reviewStatus);
    const reviewedText =
      reviewStatus !== "open" && submission.reviewed_at
        ? `${meta.label} ${formatDate(submission.reviewed_at)}`
        : "No decision yet";

    return `
      <div class="review-decision" data-review-token="${escapeAttr(reviewToken)}">
        <div class="review-decision-head">
          <span class="status-badge status-${reviewStatus}">${escapeHtml(meta.label)}</span>
          <span class="decision-timestamp">${escapeHtml(reviewedText)}</span>
        </div>
        <div class="decision-actions">
          <button class="primary decision-button" type="button" data-review-status="accepted" ${
            reviewStatus === "accepted" ? "disabled" : ""
          }>Accept</button>
          <button class="secondary reject-button decision-button" type="button" data-review-status="rejected" ${
            reviewStatus === "rejected" ? "disabled" : ""
          }>Reject</button>
        </div>
        <p class="hint decision-message" aria-live="polite">${escapeHtml(meta.reviewHint)}</p>
      </div>
    `;
  }

  function wireReviewDecision(token) {
    const decisionPanel = document.querySelector(".review-decision");
    if (!decisionPanel) return;

    const buttons = Array.from(decisionPanel.querySelectorAll("[data-review-status]"));
    const message = decisionPanel.querySelector(".decision-message");

    buttons.forEach((button) => {
      button.addEventListener("click", async () => {
        const nextStatus = normalizeReviewStatus(button.dataset.reviewStatus);
        const originalButtonStates = buttons.map((item) => ({
          item,
          disabled: item.disabled,
          text: item.textContent,
        }));
        buttons.forEach((item) => {
          item.disabled = true;
        });
        button.textContent = "Saving...";
        message.classList.remove("error");
        message.textContent =
          nextStatus === "accepted" ? "Saving as accepted..." : "Saving as rejected...";

        try {
          const updatedSubmission = await updateReviewStatus(token, nextStatus);
          app.innerHTML = receiptMarkup(updatedSubmission, true, token);
          wireReviewDecision(token);
        } catch (error) {
          originalButtonStates.forEach(({ item, disabled, text }) => {
            item.disabled = disabled;
            item.textContent = text;
          });
          message.classList.add("error");
          message.textContent = reviewStatusErrorMessage(error);
        }
      });
    });
  }

  function renderError(title, detail, statusText = "Not found") {
    setStatus(statusText);
    app.innerHTML = `
      <section class="intro-grid">
        <div class="intro-copy">
          <p class="eyebrow">Unable to load</p>
          <h2>${escapeHtml(title)}</h2>
          <p class="lede">${escapeHtml(detail || "Please check the URL and try again.")}</p>
        </div>
      </section>
    `;
  }

  function normalizeResponses(rawResponses) {
    const parsed = typeof rawResponses === "string" ? JSON.parse(rawResponses) : rawResponses || {};
    return parsed.answers || [];
  }

  function normalizeReviewStatus(value) {
    const status = String(value || "").trim().toLowerCase();
    return status === "accepted" || status === "rejected" ? status : "open";
  }

  function reviewStatusMeta(status) {
    const normalizedStatus = normalizeReviewStatus(status);
    const meta = {
      open: {
        label: "Open",
        sectionTitle: "Open submissions",
        sectionHint: "Awaiting accept or reject.",
        emptyText: "No open submissions.",
        reviewHint: "Choose Accept or Reject when the decision is ready.",
      },
      accepted: {
        label: "Accepted",
        sectionTitle: "Accepted submissions",
        sectionHint: "Moved forward after review.",
        emptyText: "No accepted submissions.",
        reviewHint: "This submission is marked accepted. The dashboard will show it under Accepted.",
      },
      rejected: {
        label: "Rejected",
        sectionTitle: "Rejected submissions",
        sectionHint: "Not moving forward after review.",
        emptyText: "No rejected submissions.",
        reviewHint: "This submission is marked rejected. The dashboard will show it under Rejected.",
      },
    };
    return meta[normalizedStatus];
  }

  function reviewStatusErrorMessage(error) {
    const message = String(error && error.message ? error.message : error || "");
    if (
      message.includes("set_sales_tl_submission_review_status") ||
      message.includes("Could not find the function")
    ) {
      return "The review decision database update has not been applied in Supabase yet.";
    }
    return message || "The decision could not be saved. Please refresh and try again.";
  }

  function saveDemoAdminSubmission(submission) {
    const submissions = fetchDemoAdminSubmissions();
    localStorage.setItem(
      "demo-admin-submissions",
      JSON.stringify([
        submission,
        ...submissions.filter((item) => item.review_token !== submission.review_token),
      ])
    );
  }

  function fetchDemoAdminSubmissions() {
    try {
      return JSON.parse(localStorage.getItem("demo-admin-submissions") || "[]");
    } catch {
      return [];
    }
  }

  function adminErrorMessage(error) {
    const message = String(error && error.message ? error.message : error || "");
    if (message.includes("get_sales_tl_submissions_for_admin") || message.includes("Could not find the function")) {
      return "The private dashboard database function has not been applied in Supabase yet.";
    }
    if (message.toLowerCase().includes("invalid admin token")) {
      return "This dashboard link is not recognised.";
    }
    return message || "Please refresh the page and try again.";
  }

  function hasPrivateAccess() {
    return localStorage.getItem(privateAccessKey) === config.privateAccessPasswordHash;
  }

  async function sha256(value) {
    if (!window.crypto || !window.crypto.subtle) {
      throw new Error("This browser cannot check the password. Please use a current browser.");
    }
    const bytes = new TextEncoder().encode(value);
    const digest = await window.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  function getAnswerHtml(scenarioId) {
    const value = state.answers[scenarioId];

    if (!value) return "";
    if (typeof value === "object") {
      return sanitizeRichHtml(value.html || plainTextToHtml(value.text || value.answer || ""));
    }
    if (looksLikeRichHtml(value)) return sanitizeRichHtml(value);
    return plainTextToHtml(value);
  }

  function wireRichEditor(editor, onChange) {
    const toolbar = editor.closest(".rich-editor-shell").querySelector(".rich-toolbar");

    editor.addEventListener("input", () => {
      onChange();
      updateToolbarState(toolbar);
    });
    editor.addEventListener("keyup", () => updateToolbarState(toolbar));
    editor.addEventListener("mouseup", () => updateToolbarState(toolbar));
    editor.addEventListener("paste", (event) => {
      event.preventDefault();
      const pastedHtml = event.clipboardData.getData("text/html");
      const pastedText = event.clipboardData.getData("text/plain");
      const safeHtml = sanitizeRichHtml(pastedHtml || plainTextToHtml(pastedText));
      document.execCommand("insertHTML", false, safeHtml);
      onChange();
      updateToolbarState(toolbar);
    });

    toolbar.querySelectorAll("[data-command]").forEach((button) => {
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => {
        editor.focus();
        document.execCommand(button.dataset.command, false, null);
        onChange();
        updateToolbarState(toolbar);
      });
    });
  }

  function updateToolbarState(toolbar) {
    toolbar.querySelectorAll("[data-command]").forEach((button) => {
      try {
        button.classList.toggle("is-active", document.queryCommandState(button.dataset.command));
      } catch {
        button.classList.remove("is-active");
      }
    });
  }

  function answerBoxMarkup(label, html) {
    return `
      <div class="answer-box">
        <strong class="answer-label">${escapeHtml(label)}</strong>
        <div class="formatted-answer">${sanitizeRichHtml(html)}</div>
      </div>
    `;
  }

  function plainTextToHtml(text) {
    const value = String(text || "").replace(/\r\n/g, "\n").trim();
    if (!value) return "";
    return value
      .split("\n")
      .map((line) => (line ? `<p>${escapeHtml(line)}</p>` : "<p><br></p>"))
      .join("");
  }

  function richTextToPlainText(html) {
    const container = document.createElement("div");
    container.innerHTML = sanitizeRichHtml(html);
    container.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
    container.querySelectorAll("p, li").forEach((node) => node.append(document.createTextNode("\n")));
    return container.textContent.replace(/\n{3,}/g, "\n\n").trim();
  }

  function sanitizeRichHtml(html) {
    const template = document.createElement("template");
    const output = document.createElement("div");
    template.innerHTML = String(html || "");

    template.content.childNodes.forEach((node) => appendCleanNode(output, node));
    output.querySelectorAll("p").forEach((node) => {
      if (!node.textContent.trim() && !node.querySelector("br")) node.remove();
    });
    return output.innerHTML.trim();
  }

  function appendCleanNode(parent, node) {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.append(document.createTextNode(node.textContent));
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tag = node.tagName.toLowerCase();
    if (tag === "script" || tag === "style") return;

    const tagMap = {
      b: "strong",
      strong: "strong",
      i: "em",
      em: "em",
      div: "p",
      p: "p",
      ul: "ul",
      ol: "ol",
      li: "li",
      br: "br",
    };
    const cleanTag = tagMap[tag];

    if (!cleanTag) {
      node.childNodes.forEach((child) => appendCleanNode(parent, child));
      return;
    }

    const element = document.createElement(cleanTag);
    node.childNodes.forEach((child) => appendCleanNode(element, child));
    parent.append(element);
  }

  function looksLikeRichHtml(value) {
    return /<\/?(strong|em|b|i|ul|ol|li|p|div|br)\b/i.test(String(value || ""));
  }

  function buildUrls(applicantToken, reviewToken) {
    const base = `${window.location.origin}${window.location.pathname}`;
    return {
      applicantUrl: `${base}?receipt=${encodeURIComponent(applicantToken)}`,
      reviewUrl: `${base}?review=${encodeURIComponent(reviewToken)}`,
    };
  }

  function configWarning() {
    if (isConfigured) return "";
    return `
      <div class="config-warning">
        Supabase is in demo mode until the anon public key is added to config.js.
      </div>
    `;
  }

  function showInlineError(container, text) {
    const existing = container.querySelector(".error");
    if (existing) existing.remove();
    const node = document.createElement("p");
    node.className = "error";
    node.textContent = text;
    container.appendChild(node);
  }

  function loadDraft() {
    try {
      return JSON.parse(localStorage.getItem(draftKey) || "{}");
    } catch {
      return {};
    }
  }

  function saveDraft() {
    localStorage.setItem(
      draftKey,
      JSON.stringify({
        applicant: state.applicant,
        answers: state.answers,
      })
    );
  }

  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function setStatus(text) {
    statusPill.textContent = text;
  }

  function isEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function formatDate(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("en-AU", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replaceAll("`", "&#096;");
  }
})();
