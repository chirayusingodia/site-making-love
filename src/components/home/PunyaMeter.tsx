import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Lottie from "lottie-react";
import { Check, Flame, AlertCircle, Sparkles, ArrowRight } from "lucide-react";
import { useTranslation } from "@/lib/translations";

export function PunyaMeter() {
  const { t, lang } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [selectedValue, setSelectedValue] = useState<boolean | null>(null);
  const [isFinished, setIsFinished] = useState(false);

  // States for Lottie JSON payloads
  const [diyaFlameData, setDiyaFlameData] = useState<any>(null);
  const [successCheckData, setSuccessCheckData] = useState<any>(null);

  // Dynamically populated questions and benefits based on current language
  const QUESTIONS = [
    t("pm_ques_parent"),
    t("pm_ques_1"),
    t("pm_ques_2"),
    t("pm_ques_3"),
    t("pm_ques_4"),
    t("pm_ques_5"),
  ];

  const BENEFITS = [
    t("pm_benefit_1"),
    t("pm_benefit_2"),
    t("pm_benefit_3"),
    t("pm_benefit_4"),
    t("pm_benefit_5"),
    t("pm_benefit_6"),
    t("pm_benefit_7"),
    t("pm_benefit_8"),
  ];

  // Attempt to fetch Lottie assets dynamically
  useEffect(() => {
    fetch("/lottie/diya-flame.json")
      .then((res) => {
        if (!res.ok) throw new Error("Not found");
        return res.json();
      })
      .then((data) => {
        if (data && (data.layers || data.v)) {
          setDiyaFlameData(data);
        }
      })
      .catch(() => {
        console.log("Diya flame Lottie asset not available, using CSS fallback.");
      });

    fetch("/lottie/success-check.json")
      .then((res) => {
        if (!res.ok) throw new Error("Not found");
        return res.json();
      })
      .then((data) => {
        if (data && (data.layers || data.v)) {
          setSuccessCheckData(data);
        }
      })
      .catch(() => {
        console.log("Success check Lottie asset not available, using CSS fallback.");
      });
  }, []);

  const handleNext = () => {
    if (selectedValue === null) return;
    const updatedAnswers = [...answers, selectedValue];
    setAnswers(updatedAnswers);
    setSelectedValue(null);

    if (currentIndex < QUESTIONS.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setIsFinished(true);
    }
  };

  const handleReset = () => {
    setCurrentIndex(0);
    setAnswers([]);
    setSelectedValue(null);
    setIsFinished(false);
  };

  const yesCount = answers.filter(Boolean).length;
  const isPass = yesCount >= 4;

  const handleScrollToPlans = (e: React.MouseEvent) => {
    e.preventDefault();
    const plansSection = document.getElementById("plans");
    if (plansSection) {
      plansSection.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="space-y-6 w-full animate-fade-up">
      {/* Quiz Card Wrapper for Floating Badge */}
      <div className="relative pt-3.5">
        {/* Floating Green Badge with Saying */}
        <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 bg-[#3B6D11] text-white text-[10px] sm:text-xs font-black px-4 py-2 rounded-full shadow-md z-10 flex items-center gap-1.5 w-[90%] sm:w-auto justify-center text-center leading-tight border border-white/10">
          <Sparkles className="w-3.5 h-3.5 text-[#F5A742] fill-[#F5A742]/20 shrink-0 animate-pulse" />
          <span>{t("pm_badge")}</span>
        </div>

        {/* Quiz Card */}
        <div className="bg-[#FDF3EB] border-2 border-[#F0DFC8] rounded-2xl p-6 shadow-md relative overflow-hidden pt-8">
          {/* Centered Premium Header */}
          <div className="flex flex-col items-center text-center space-y-4 mb-6 pt-2">
            {/* Pulsing Diya Flame Badge */}
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#E85D1F]/20 to-[#F5A742]/20 flex items-center justify-center border-2 border-[#E85D1F]/30 shadow-md relative">
              <span className="absolute inset-0 rounded-full bg-[#E85D1F]/10 blur-sm animate-pulse" />
              {diyaFlameData ? (
                <Lottie
                  animationData={diyaFlameData}
                  loop={true}
                  style={{ width: 44, height: 44 }}
                />
              ) : (
                <Flame className="w-8 h-8 text-[#E85D1F] fill-[#E85D1F]/30 animate-pulse" />
              )}
            </div>

            <div className="space-y-3 w-full">
              <span className="inline-block bg-[#E85D1F] text-white text-[11px] font-black tracking-widest uppercase px-3 py-1 rounded-full shadow-sm">
                {t("pm_title")}
              </span>
              
              {/* Visually stunning highlight container for the key question */}
              <div className="relative max-w-lg mx-auto bg-gradient-to-b from-white to-[#FDF1EC] border border-[#F0DFC8] rounded-2xl p-4 md:p-6 shadow-inner mt-1">
                {/* Decorative Quote Icons */}
                <div className="absolute top-2 left-3 text-4xl text-[#E85D1F]/10 font-serif leading-none select-none">“</div>
                <div className="absolute bottom-1 right-3 text-4xl text-[#E85D1F]/10 font-serif leading-none select-none">”</div>
                
                <p className="text-base md:text-lg font-black text-[#5B1A1A] leading-relaxed font-display px-4">
                  {t("pm_subtitle")}
                </p>
                <div className="w-12 h-1 bg-[#E85D1F] mx-auto mt-3.5 rounded-full opacity-70" />
              </div>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {!isFinished ? (
              <motion.div
                key="quiz-body"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                {/* Form header step indicator */}
                <div className="flex justify-between items-center text-xs font-bold text-muted-foreground uppercase tracking-widest px-0.5">
                  <span>{lang === "hindi" ? "पुण्य मापन फॉर्म" : "Punya Assessment"}</span>
                  <span className="text-[#D85A30]">
                    {lang === "hindi" 
                      ? `प्रश्न ${currentIndex + 1} / ${QUESTIONS.length}`
                      : `Question ${currentIndex + 1} / ${QUESTIONS.length}`
                    }
                  </span>
                </div>

                {/* Segmented Progress Bar */}
                <div className="relative h-2 w-full bg-black/5 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: "0%" }}
                    animate={{ width: `${((currentIndex + 1) / QUESTIONS.length) * 100}%` }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="h-full bg-[#D85A30]"
                  />
                  <div className="absolute inset-0 flex justify-between pointer-events-none">
                    {Array.from({ length: QUESTIONS.length - 1 }).map((_, idx) => (
                      <div key={idx} className="w-[1.5px] h-full bg-white/50" />
                    ))}
                  </div>
                </div>

                {/* ── Q&A CARD: question + answers live together in one sheet ── */}
                <div className="bg-white border-2 border-[#F0DFC8] rounded-2xl shadow-sm overflow-hidden">
                  {/* Question row */}
                  <div className="px-5 pt-5 pb-4">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={currentIndex}
                        initial={{ opacity: 0, x: 16 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -16 }}
                        transition={{ duration: 0.2 }}
                        className="flex items-start gap-3"
                      >
                        {/* Q badge */}
                        <span className="shrink-0 w-8 h-8 rounded-lg bg-[#D85A30] text-white text-xs font-black flex items-center justify-center shadow-sm">
                          {lang === "hindi" ? `प्र${currentIndex + 1}` : `Q${currentIndex + 1}`}
                        </span>
                        <p className="text-base md:text-lg font-extrabold text-[#1A1A1A] leading-snug font-display pt-1">
                          {QUESTIONS[currentIndex]}
                        </p>
                      </motion.div>
                    </AnimatePresence>
                  </div>

                  {/* Answer zone — visually attached, on a tinted sheet */}
                  <div className="border-t border-dashed border-[#F0DFC8] bg-[#FFFBF7] px-5 pt-3.5 pb-5">
                    <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#D85A30]/70 mb-2.5">
                      {lang === "hindi" ? "अपना उत्तर चुनें" : "Choose your answer"}
                    </p>

                    <div className="space-y-2.5">
                      {[
                        { value: true, label: t("pm_yes") },
                        { value: false, label: t("pm_no") },
                      ].map((opt) => {
                        const active = selectedValue === opt.value;
                        return (
                          <button
                            key={String(opt.value)}
                            type="button"
                            onClick={() => setSelectedValue(opt.value)}
                            aria-pressed={active}
                            className={`w-full flex items-center gap-3 text-left py-3.5 px-4 border-2 rounded-xl transition-all active:scale-[0.99] ${
                              active
                                ? "bg-[#D85A30]/[0.06] border-[#D85A30] shadow-sm"
                                : "bg-white border-[#F0DFC8] hover:border-[#D85A30]/50 hover:bg-[#D85A30]/[0.03]"
                            }`}
                          >
                            {/* radio dot */}
                            <span
                              className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                                active ? "border-[#D85A30] bg-[#D85A30]" : "border-[#D9C4A9] bg-white"
                              }`}
                            >
                              {active && <Check className="w-3 h-3 text-white stroke-[4]" />}
                            </span>
                            <span
                              className={`text-sm font-bold ${
                                active ? "text-[#D85A30]" : "text-[#4B5563]"
                              }`}
                            >
                              {opt.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Next button — inside the card, so it reads as "submit this answer" */}
                    <button
                      disabled={selectedValue === null}
                      onClick={handleNext}
                      className={`mt-4 w-full py-3.5 px-4 font-bold rounded-full transition-all text-sm flex items-center justify-center gap-2 ${
                        selectedValue !== null
                          ? "bg-[#D85A30] hover:bg-[#B8460F] text-white shadow-md active:scale-[0.98] primary-btn-glow"
                          : "bg-[#EFE6DC] text-[#B9A894] cursor-not-allowed"
                      }`}
                    >
                      {selectedValue === null
                        ? lang === "hindi"
                          ? "पहले उत्तर चुनें"
                          : "Select an answer first"
                        : lang === "hindi"
                          ? "आगे बढ़ें"
                          : "Next"}
                      {selectedValue !== null && <ArrowRight size={16} />}
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="results-body"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                className="text-center py-6 space-y-6"
              >
                {/* Result Icon */}
                <div className="flex justify-center">
                  {isPass ? (
                    <div className="w-16 h-16 rounded-full bg-[#3B6D11]/10 border border-[#3B6D11]/20 flex items-center justify-center text-[#3B6D11]">
                      {successCheckData ? (
                        <Lottie
                          animationData={successCheckData}
                          loop={false}
                          style={{ width: 50, height: 50 }}
                        />
                      ) : (
                        <Check className="w-8 h-8 stroke-[3]" />
                      )}
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-[#993C1D]/10 border border-[#993C1D]/20 flex items-center justify-center text-[#993C1D] animate-bounce">
                      <AlertCircle className="w-8 h-8 stroke-[2.5]" />
                    </div>
                  )}
                </div>

                {/* Score and Message */}
                <div className="space-y-2">
                  <div
                    className={`text-2xl font-black ${
                      isPass ? "text-[#3B6D11]" : "text-[#993C1D]"
                    }`}
                  >
                    {isPass ? t("pm_pass_msg") : t("pm_fail_msg")}
                  </div>
                  <div className="text-sm font-semibold text-muted-foreground">
                    {/* [Bug 3.2] was a hardcoded "/ 5" while the quiz has
                        QUESTIONS.length items — all-yes showed "6 / 5". */}
                    {t("pm_score")}:{" "}
                    <span className="text-foreground font-black text-lg">{yesCount}</span> /{" "}
                    {QUESTIONS.length}
                  </div>
                </div>

                {/* CTA or Soft Message */}
                {isPass ? (
                  <div className="bg-[#3B6D11]/5 border border-[#3B6D11]/10 rounded-xl p-4 text-sm text-[#3B6D11] leading-relaxed">
                    {t("pm_pass_bless")}
                  </div>
                ) : (
                  <div className="space-y-3 pt-2">
                    <p className="text-sm text-[#993C1D]/80 leading-relaxed max-w-sm mx-auto">
                      {t("pm_fail_bless")}
                    </p>
                    <a
                      href="#plans"
                      onClick={handleScrollToPlans}
                      className="inline-flex items-center justify-center gap-2 bg-[#D85A30] text-white font-bold px-6 py-3.5 rounded-full shadow-lg shadow-[#D85A30]/25 btn-glow btn-glow-pulse w-full sm:w-auto"
                    >
                      {t("pm_cta")} <ArrowRight size={18} />
                    </a>
                  </div>
                )}

                {/* Reset link */}
                <button
                  onClick={handleReset}
                  className="text-xs font-bold text-[#D85A30]/70 hover:text-[#D85A30] underline block mx-auto pt-2"
                >
                  {t("pm_reset")}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Benefits Card */}
      <div className="bg-white border border-[#F0DFC8] rounded-2xl p-6 shadow-sm">
        <h3 className="text-lg font-extrabold text-[#1A1A1A] tracking-tight mb-4 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-[#D85A30]" />
          {t("pm_benefits_title")}
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {BENEFITS.map((benefit, index) => (
            <div key={index} className="flex items-start gap-2.5">
              <div className="w-5 h-5 rounded-full bg-[#3B6D11]/10 flex items-center justify-center shrink-0 mt-0.5 text-[#3B6D11]">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </div>
              <span className="text-sm text-[#4B5563] leading-snug">
                {benefit}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
