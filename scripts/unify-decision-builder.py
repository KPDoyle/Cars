from pathlib import Path

path = Path('components/decision-app.tsx')
text = path.read_text()

old_nav = '''  { id: "profile", label: "Buyer profile", icon: SlidersHorizontal },
  { id: "model", label: "Decision model", icon: Settings2 },'''
new_nav = '''  { id: "profile", label: "Build your decision", icon: SlidersHorizontal },'''
if old_nav not in text:
    raise SystemExit('nav marker not found')
text = text.replace(old_nav, new_nav)

start = text.index('        {view === "profile" ? (')
end = text.index('        {view === "data" ? (', start)

combined = r'''        {view === "profile" ? (
          <section className="page">
            <PageTitle eyebrow="Your car-ranking formula" title="Build your decision" description="Tell CarWise how you buy and use a car, decide what matters most, then see the ranking change immediately." />

            <div className="section-head model-section-head">
              <div><p className="eyebrow">Step 1 · You and your car</p><h2>Tell CarWise what you need</h2><p>These settings describe your real budget, mileage, journeys, energy costs and ownership plans.</p></div>
            </div>
            <div className="profile-layout">
              <div className="settings-card">
                <h3>Your life & budget</h3>
                <RangeField label="Maximum budget" value={profile.budget} min={25000} max={60000} step={1000} suffix="" onChange={(value) => changeProfile("budget", value)} />
                <RangeField label="Annual mileage" value={profile.annualMiles} min={4000} max={25000} step={500} suffix=" miles" onChange={(value) => changeProfile("annualMiles", value)} />
                <RangeField label="Typical journey" value={profile.typicalJourney} min={10} max={100} step={5} suffix=" miles" onChange={(value) => changeProfile("typicalJourney", value)} />
                <RangeField label="How long you will keep it" value={profile.ownershipYears} min={3} max={7} step={0.5} suffix=" years" onChange={(value) => changeProfile("ownershipYears", value)} />
                <div className="choice-field"><span>How you want to buy</span><div className="choice-buttons"><button className={profile.purchaseMode === "new" ? "active" : ""} onClick={() => changeProfile("purchaseMode", "new")}>New</button><button className={profile.purchaseMode === "nearly-new" ? "active" : ""} onClick={() => changeProfile("purchaseMode", "nearly-new")}>6–12 months old</button></div></div>
              </div>

              <div className="settings-card">
                <h3>Energy & charging</h3>
                <div className="live-assumption"><span className="dot live" /><strong>Octopus live rate: {live.market.octopusOffPeakPence ?? "—"}p/kWh</strong><small>Official source checked {live.market.octopusCheckedAt ? new Date(live.market.octopusCheckedAt).toLocaleString("en-GB") : "—"}</small></div>
                <RangeField label="Home electricity" value={profile.electricityPence} min={5} max={35} step={1} suffix="p/kWh" onChange={(value) => changeProfile("electricityPence", value)} />
                <div className="live-assumption"><span className="dot live" /><strong>UK petrol live: {live.market.petrolPencePerLitre?.toFixed(1) ?? "—"}p/L</strong><small>DESNZ weekly official data</small></div>
                <RangeField label="Petrol" value={profile.petrolPencePerLitre} min={115} max={210} step={1} suffix="p/L" onChange={(value) => changeProfile("petrolPencePerLitre", value)} />
                <RangeField label="How reliably you would charge a PHEV" value={profile.chargeDiscipline} min={20} max={100} step={5} suffix="%" onChange={(value) => changeProfile("chargeDiscipline", value)} />
                <div className="assumption-note"><Zap size={17} /><p>A plug-in hybrid only gets credit for electric miles you could realistically drive.</p></div>
              </div>

              <div className="settings-card">
                <h3>Extra personal priorities</h3>
                <RangeField label="Warranty matters to me" value={profile.warrantyWeight} min={5} max={25} step={1} suffix="%" onChange={(value) => changeProfile("warrantyWeight", value)} />
                <RangeField label="Avoiding depreciation matters to me" value={profile.depreciationWeight} min={10} max={30} step={1} suffix="%" onChange={(value) => changeProfile("depreciationWeight", value)} />
                <RangeField label="Comfort matters to me" value={profile.comfortWeight} min={5} max={20} step={1} suffix="%" onChange={(value) => changeProfile("comfortWeight", value)} />
                <button className="secondary-button full" onClick={() => setProfile(studyProfile)}><RefreshCcw size={16} /> Reset buyer profile</button>
              </div>

              <div className="live-result-card">
                <div>
                  <p className="eyebrow">Your current leader</p>
                  <VehicleBadge powertrain={winner.powertrain} />
                  <h2>{winner.brand} {winner.model}</h2>
                  <p>{winner.trim}</p>
                  <span className={classNames("profile-active", profileChangeCount > 0 && "changed")}>
                    {profileChangeCount > 0 ? `${profileChangeCount} buyer setting${profileChangeCount === 1 ? "" : "s"} changed` : "Default buyer profile"}
                  </span>
                </div>
                <div className="live-score">
                  <strong>{currentWinnerScore.toFixed(1)}</strong>
                  <span>/100 fit</span>
                  <small className={classNames("score-delta", scoreDeltaFromStudy > 0.05 ? "up" : scoreDeltaFromStudy < -0.05 ? "down" : "")}>
                    {Math.abs(scoreDeltaFromStudy) < 0.05 ? "Study profile" : `${scoreDeltaFromStudy > 0 ? "+" : ""}${scoreDeltaFromStudy.toFixed(1)} vs study profile`}
                  </small>
                </div>
                <div className="metric-grid compact"><div><span>Purchase</span><strong>{money(purchasePrice(winner, profile))}</strong></div><div><span>TCO</span><strong>{money(winnerTco.total)}</strong></div><div><span>Energy</span><strong>{money(annualEnergyCost(winner, profile).total)}/yr</strong></div><div><span>Warranty exit</span><strong>{winnerExit.yearsFromPurchase.toFixed(1)} yrs</strong></div></div>
              </div>
            </div>

            <div className="section-head model-section-head">
              <div><p className="eyebrow">Step 2 · What makes a good car?</p><h2>Spend your 100 decision points</h2><p>Give more points to the things you care about most. CarWise uses this to recalculate the research score for every car.</p></div>
            </div>
            <div className="baseline-editor-card">
              <div className="baseline-editor-top">
                <div>
                  <h2>Your 100-point formula</h2>
                  <p>The original study uses 20 + 20 + 15 + 10 + 10 + 8 + 7 + 4 + 3 + 2 + 1 = 100. Change any number to build your own formula.</p>
                </div>
                <div className={classNames("baseline-total", Math.abs(baselineWeightTotal - 100) < 0.05 && "exact")}>
                  <strong>{baselineWeightTotal.toFixed(1)}</strong>
                  <span>/ 100 points</span>
                  <small>{Math.abs(baselineWeightTotal - 100) < 0.05 ? "Ready" : "CarWise will normalise it"}</small>
                </div>
              </div>

              <div className="baseline-point-grid">
                {researchWeightRows.map((item) => {
                  const effective = baselineWeightTotal > 0 ? (decisionModel[item.key] / baselineWeightTotal) * 100 : 0;
                  return (
                    <label className="baseline-point-row" key={item.key}>
                      <span className="baseline-point-copy">
                        <strong>{item.label}</strong>
                        <small>Original {item.original} pts · Current share {effective.toFixed(1)}%</small>
                      </span>
                      <span className="baseline-point-input">
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={100}
                          step={1}
                          value={decisionModel[item.key]}
                          onFocus={(event) => event.currentTarget.select()}
                          onClick={(event) => event.currentTarget.select()}
                          onChange={(event) => {
                            const cleaned = event.currentTarget.value.replace(/^0+(?=\d)/, "");
                            if (cleaned !== event.currentTarget.value) event.currentTarget.value = cleaned;
                            changeDecisionModel(item.key, Math.max(0, Math.min(100, Number(cleaned) || 0)));
                          }}
                          aria-label={`${item.label} decision points`}
                        />
                        <b>pts</b>
                      </span>
                    </label>
                  );
                })}
              </div>

              <div className="baseline-editor-actions">
                <button className="primary-button" onClick={normaliseResearchBaseline}>Make total exactly 100</button>
                <button className="secondary-button" onClick={resetResearchBaseline}><RefreshCcw size={16} /> Restore original 100</button>
              </div>
            </div>

            <div className="section-head model-section-head">
              <div><p className="eyebrow">Step 3 · How should CarWise decide?</p><h2>Balance research with your personal fit</h2><p>This decides whether the final answer should lean more on the general research or more on your own circumstances.</p></div>
            </div>
            <div className="profile-layout">
              <div className="settings-card">
                <h3>Research vs you</h3>
                <RangeField label="Research influence" value={decisionModel.studyEvidenceWeight} min={0} max={100} step={5} suffix="%" onChange={(value) => changeDecisionModel("studyEvidenceWeight", value)} />
                <div className="assumption-note"><Settings2 size={17} /><p><strong>{decisionModel.studyEvidenceWeight}% research</strong> + <strong>{100 - decisionModel.studyEvidenceWeight}% your personal fit</strong>.</p></div>
                <p className="baseline-editor-note">30% research / 70% personal fit is the default. Move towards research for a more general best-car answer; move towards personal fit for a more individual recommendation.</p>
              </div>

              <div className="live-result-card">
                <div>
                  <p className="eyebrow">Your formula result</p>
                  <VehicleBadge powertrain={winner.powertrain} />
                  <h2>{winner.brand} {winner.model}</h2>
                  <p>{winner.trim}</p>
                  <span className={classNames("profile-active", (modelChangeCount > 0 || profileChangeCount > 0) && "changed")}>
                    {modelChangeCount > 0 || profileChangeCount > 0 ? "Your custom formula is active" : "Original CarWise formula"}
                  </span>
                </div>
                <div className="live-score"><strong>{currentWinnerScore.toFixed(1)}</strong><span>/100 final fit</span><small>{modelLoaded ? "Saved automatically" : "Loading saved model"}</small></div>
                <div className="metric-grid compact">
                  <div><span>Research score</span><strong>{currentWinnerResearchScore.toFixed(1)}/100</strong></div>
                  <div><span>Research influence</span><strong>{decisionModel.studyEvidenceWeight}%</strong></div>
                  <div><span>Personal influence</span><strong>{100 - decisionModel.studyEvidenceWeight}%</strong></div>
                  <div><span>100-point total</span><strong>{baselineWeightTotal.toFixed(1)}</strong></div>
                </div>
                <div className="profile-ranking">
                  <div className="profile-ranking-head"><span>Live overall ranking</span><small>Changes as you edit your formula</small></div>
                  {ranked.slice(0, 5).map((vehicle, index) => (
                    <div className="profile-ranking-row" key={vehicle.id}>
                      <span>#{index + 1}</span>
                      <div><strong>{vehicle.brand} {vehicle.model}</strong><small>Research {researchBaselineScore(vehicle, decisionModel).toFixed(1)} · {vehicle.trim}</small></div>
                      <b>{personalisedScore(vehicle, profile, decisionModel).toFixed(1)}</b>
                    </div>
                  ))}
                </div>
                <button className="primary-button" onClick={() => changeView("dashboard")}>See full decision <ChevronRight size={16} /></button>
              </div>
            </div>

            <details className="optional-feeds decision-advanced">
              <summary>Advanced tuning — optional</summary>
              <p>You normally do not need these controls. They let you change how strongly CarWise calculates buyer fit and how harshly it treats cars over budget.</p>
              <div className="profile-layout">
                <div className="settings-card">
                  <h3>Buyer-fit ingredients</h3>
                  <RangeField label="Budget fit" value={decisionModel.budgetWeight} min={0} max={40} step={1} suffix="" onChange={(value) => changeDecisionModel("budgetWeight", value)} />
                  <RangeField label="Warranty fit" value={decisionModel.warrantyWeight} min={0} max={40} step={1} suffix="" onChange={(value) => changeDecisionModel("warrantyWeight", value)} />
                  <RangeField label="Depreciation / residual" value={decisionModel.depreciationWeight} min={0} max={40} step={1} suffix="" onChange={(value) => changeDecisionModel("depreciationWeight", value)} />
                  <RangeField label="Comfort" value={decisionModel.comfortWeight} min={0} max={30} step={1} suffix="" onChange={(value) => changeDecisionModel("comfortWeight", value)} />
                </div>
                <div className="settings-card">
                  <h3>Usage & purchase fit</h3>
                  <RangeField label="Running cost" value={decisionModel.runningCostWeight} min={0} max={30} step={1} suffix="" onChange={(value) => changeDecisionModel("runningCostWeight", value)} />
                  <RangeField label="Journey / range fit" value={decisionModel.journeyWeight} min={0} max={30} step={1} suffix="" onChange={(value) => changeDecisionModel("journeyWeight", value)} />
                  <RangeField label="New vs nearly-new strategy" value={decisionModel.strategyWeight} min={0} max={25} step={1} suffix="" onChange={(value) => changeDecisionModel("strategyWeight", value)} />
                </div>
                <div className="settings-card">
                  <h3>Budget strictness</h3>
                  <RangeField label="Initial over-budget penalty" value={decisionModel.overBudgetBasePenalty} min={0} max={20} step={1} suffix=" pts" onChange={(value) => changeDecisionModel("overBudgetBasePenalty", value)} />
                  <RangeField label="Extra penalty per £1k" value={decisionModel.overBudgetPenaltyPer1000} min={0} max={10} step={0.5} suffix=" pts" onChange={(value) => changeDecisionModel("overBudgetPenaltyPer1000", value)} />
                  <RangeField label="Maximum budget penalty" value={decisionModel.overBudgetPenaltyCap} min={0} max={50} step={1} suffix=" pts" onChange={(value) => changeDecisionModel("overBudgetPenaltyCap", value)} />
                  <button className="secondary-button full" onClick={() => setDecisionModel(defaultDecisionModel)}><RefreshCcw size={16} /> Reset decision rules</button>
                </div>
              </div>
            </details>

            <div className="callout"><Info size={18} /><div><strong>Buyer profile and decision rules now live together.</strong><p>You can start at the top, work down the page and see the recommendation change without switching between two separate menus. The original study can always be restored.</p></div></div>
          </section>
        ) : null}

'''

text = text[:start] + combined + text[end:]
text = text.replace('The research baseline itself is now configurable from the Decision model page.', 'The research baseline and buyer profile are configurable together from Build your decision.')
text = text.replace('onClick={() => changeView("profile")}><Settings2 size={16} /> Change assumptions', 'onClick={() => changeView("profile")}><Settings2 size={16} /> Build your decision')
text = text.replace('The 100-point research baseline and buyer-fit layer are both configurable.', 'Your buyer profile and 100-point ranking formula are configurable together.')

path.write_text(text)
