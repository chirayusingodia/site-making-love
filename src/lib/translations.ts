import { useState, useEffect } from "react";

export type Lang = "hindi" | "english";
export const LANG_KEY = "punyata:lang";

export const translations = {
  hindi: {
    // Navigation / Header
    nav_home: "मुख्य पृष्ठ",
    nav_plans: "सदस्यता",
    nav_sevas: "हमारी सेवाएं",
    nav_reviews: "समीक्षाएं",
    nav_about: "हमारे बारे में",
    nav_faq: "सामान्य प्रश्न",
    nav_my_subscription: "मेरी सदस्यता",

    // Trust — 11 years
    trust_years_badge: "11 साल का विश्वास",
    trust_years_line: "पिछले 11 वर्षों से पुण्यता आपकी सेवा में है — एक संगठित सेवा, आपके भरोसे पर बनी।",
    trust_years_footer: "11 साल का विश्वास · भारत का पुण्य बैंक",

    // Homepage Hero
    hero_badge: "1,200+ परिवार इस सेवा से जुड़े हैं",
    hero_sub: "जय सियाराम • तीर्थ गुरु पुष्करराज से",
    hero_title_1: "पुण्य आपका,",
    hero_title_2: "सेवा हमारी।",
    hero_desc:
      "व्यस्तता के कारण खुद दान-पुण्य, हवन, पूजा नहीं कर पाते? पुण्यता आपके नाम एवं गोत्र से तीर्थ गुरु पुष्करराज में यह ज़िम्मेदारी निभाता है — हर सेवा का प्रमाण सीधे आपके WhatsApp पर.",
    hero_cta: "See Sadasyata — ₹251/Monthly से शुरू",

    // Homepage Mission
    mission_relief: "The Relief",
    mission_title: "व्यस्तता की वजह से पुण्य पीछे न रह जाए।",
    mission_desc:
      "शहर की दौड़-भाग में हर घर अपने दान-पुण्य, हवन और पूजा से दूर होता जा रहा है। पुण्यता यह ज़िम्मेदारी अपने ऊपर लेता है — आपके नाम, आपके गोत्र, आपके संकल्प से।",
    mission_quote: '"हम आपकी ज़िम्मेदारी नहीं लेते — हम उसे आपकी ओर से निभाते हैं।"',

    // How It Works
    hiw_title: "कैसे काम करता है",
    hiw_step: "STEP",
    hiw_step_1_title: "संकल्प (Sankalp)",
    hiw_step_1_desc: "अपने नाम एवं गोत्र से मासिक संकल्प लें।",
    hiw_step_2_title: "सेवा (Seva)",
    hiw_step_2_desc: "तीर्थ गुरु पुष्करराज में आपकी सेवा सम्पन्न होती है।",
    hiw_step_3_title: "प्रमाण (Pramaan)",
    hiw_step_3_desc: "हर अनुष्ठान का Video Proof आपके WhatsApp पर।",

    // Proof Gallery
    gallery_title: "Proof Gallery",
    gallery_see_all: "See All →",
    gallery_type: "Video",
    gallery_footer: "हर सेवा का Live/Video Proof — WhatsApp पर हर माह।",

    // Kaliyug Section
    kaliyug_badge: "कलियुग में दान-पुण्य",
    kaliyug_title: "पुण्य ही एकमात्र संचित धन है।",
    kaliyug_footer:
      "जब हम स्वयं दान-पुण्य नहीं कर पाते — तो पुण्यता यह पवित्र कर्तव्य आपके नाम से निभाता है।",

    // Family Section
    family_title: "पूरे परिवार के लिए",
    family_desc:
      "एक सदस्यता — 4 सदस्यों तक का संकल्प। हर व्यक्ति का नाम एवं गोत्र संकल्प में बोला जाता है।",

    // Plans preview
    plans_sub: "₹251/Monthly से शुरू • 4 सदस्यों तक",
    plans_view_details: "विवरण देखें",
    plans_see_full: "See Full Sadasyata",
    plans_footer: "कोई Hidden Charges नहीं · कभी भी Cancel · 100% Secure via Razorpay",

    // Punya Meter
    pm_title: "Punya Meter",
    pm_subtitle:
      "Kya aap apne aur apni family ke liye har mahine punya kar paa rahe ho, vedic rituals ke saath?",
    pm_badge: "पुण्य ही वह एकमात्र धन है, जो इस जीवन के बाद भी आपके साथ जाता है",
    pm_ques_parent: "क्या आप माता-पिता के निमित्त दान-पुण्य करवा पाते हैं?",
    pm_ques_1: "5 sadhu-santon ko bhojan (Saadhu Santo Ko Bhojan) — vedic sankalp sahit",
    pm_ques_2: "Gau Mata ko chara / seva",
    pm_ques_3: "Hanuman ji ke nimit bandaron ko chana/kele (Vanara Seva)",
    pm_ques_4: "Sundarkand Paath vidhi-vidhan se",
    pm_ques_5: "Hawan ya Daan-Punya vedic vidhi se",
    pm_yes: "Haan, kar paata hoon",
    pm_no: "Nahi, nahi kar paata",
    pm_pass_msg: "Aapka Punya Bank sahi hai",
    pm_fail_msg: "Aapka Punya Bank sahi nahi hai",
    pm_score: "Score",
    pm_pass_bless:
      "🕉️ Pranam! Aap niyamit roop se punya karya kar rahe hain. Hanuman ji ki kripa aap par aur aapke parivar par sadav bani rahe.",
    pm_fail_bless:
      "Kaliyug mein niyamit daan-punya hi hamara sabse bada suraksha kavach hai. Vyastata ko apni punya yatra mein baadha na banne dein.",
    pm_cta: "अपनी पुण्य यात्रा शुरू करें",
    pm_reset: "Punya Meter Phir Se Check Karein",
    pm_benefits_title: "Niyamit Daan-Punya Ke Laabh",
    pm_benefit_1: "Grih-kalesh evam vastu dosh ka shaman",
    pm_benefit_2: "Parivar ke sabhi sadasyon par Hanuman ji ki kripa",
    pm_benefit_3: "Aarthik baadha evam daridrata ka naash",
    pm_benefit_4: "Purvajon ki tripti evam aashirwad",
    pm_benefit_5: "Parivar mein sakaratmak urja evam maansik shanti",
    pm_benefit_6: "Pitra dosh evam grah dosh ka shaman",
    pm_benefit_7: "Shri Hanuman ji ki kripa se bhay evam sankat ka naash",
    pm_benefit_8: "Pratyaksh daan-punya ka satat pravaah",

    // Checkout
    checkout_back: "वापस Sadasyata पर",
    checkout_plan_not_found: "Sadasyata नहीं मिला",
    checkout_back_to_plans: "सदस्यता पर वापस जाएं",
    checkout_load_error_title: "Checkout load नहीं हो पाया",
    checkout_load_error_desc: "Live Sadasyata data fetch करने में समस्या आई। कृपया पुनः प्रयास करें।",
    checkout_retry: "पुनः प्रयास करें",
    checkout_retrying: "प्रयास जारी है…",
    checkout_your_details: "आपकी जानकारी",
    checkout_name_label: "नाम",
    checkout_name_placeholder: "आपका नाम",
    checkout_phone_label: "मोबाइल नंबर",
    checkout_phone_placeholder: "10-अंकों का मोबाइल नंबर",
    checkout_saving: "Save हो रहा है…",
    checkout_family_note: "परिवार के नाम-गोत्र भुगतान के बाद profile पर जोड़े जाते हैं।",
    checkout_order_summary: "Order Summary",
    checkout_plan_label: "Sadasyata",
    checkout_amount_label: "राशि",
    checkout_trust_refund_title: "100% Refund",
    checkout_trust_refund_desc: "पात्र होने पर पूरी राशि वापस",
    checkout_trust_cancel_title: "कभी भी Cancel करें",
    checkout_trust_cancel_desc: "कोई अतिरिक्त शुल्क नहीं",
    checkout_trust_secure_title: "100% सुरक्षित",
    checkout_trust_secure_desc: "Razorpay द्वारा एन्क्रिप्टेड",
    checkout_terms_confirm: "मैं यह confirm करता/करती हूं कि मैंने",
    checkout_terms_tc: "नियम एवं शर्तें",
    checkout_terms_and: "तथा",
    checkout_terms_refund: "Refund Policy",
    checkout_terms_read: "पढ़ ली है और उनसे सहमत हूं।",
    checkout_pay_button: "Confirm & Pay",
    checkout_opening_gateway: "Razorpay खुल रहा है…",
    checkout_secure_footer: "100% Secure Payment via Razorpay · UPI AutoPay / Card",
    checkout_paid_title: "Payment मिल गया!",
    checkout_paid_sub: "आपकी सदस्यता confirm हो रही है…",
    checkout_name_required: "नाम डालें",
    checkout_phone_required: "10-अंकों का valid मोबाइल नंबर डालें",
    checkout_identity_save_error: "Details save नहीं हो पाईं।",
    checkout_gateway_error: "Payment gateway load नहीं हुआ — इंटरनेट check करके retry करें।",
    checkout_keys_error: "Payment keys configured नहीं हैं — थोड़ी देर बाद try करें।",
    checkout_cancelled_msg: "Payment cancel हो गया — जब चाहें दोबारा try करें।",
    checkout_generic_error: "Payment शुरू नहीं हो पाया।",

    // Units (composed as `${n} ${unit}`)
    unit_day: "दिन",
    unit_days: "दिन",
    unit_month: "माह",
    unit_months: "माह",

    // Seva cadence labels
    sd_2nd_tuesday: "दूसरा मंगलवार",
    sd_last_saturday: "अंतिम शनिवार",

    // Member cue (header / nav)
    member_badge: "सदस्य",

    // Subscriber banner (home)
    b_active: "सदस्यता सक्रिय",
    b_just_joined: "अभी-अभी जुड़े",
    b_active_since: "माह से जुड़े",
    b_greeting: "जय सियाराम,",
    b_ji: "जी",
    b_your: "आपकी",
    b_seva_active: "सेवा चालू है",
    b_next_seva: "अगली सेवा",
    b_per_month: "हर माह",
    b_your_name: "आपके नाम से",
    b_included: "इसमें शामिल",
    b_cta: "मेरी सदस्यता देखें",

    // Shared subscription words
    s_active: "सक्रिय",
    s_today: "आज",
    s_sevas: "सेवाएँ",
    s_video_proof: "WhatsApp Video Proof",

    // My Subscription — Punya Bank
    ms_punya_bank: "आपका पुण्य बैंक",
    ms_joined: "जुड़े",
    ms_sevas_done: "सेवाएँ संपन्न",
    ms_in_name_gotra: "आपके नाम एवं गोत्र से",
    ms_journey: "आपकी सेवा यात्रा शुरू 🪔",
    ms_first_seva: "पहली सेवा",
    ms_confirm_wait: "आपकी सदस्यता की पुष्टि होते ही पहली सेवा शुरू होगी।",
    ms_active_membership: "सक्रिय सदस्यता",
    ms_new: "नया",
    ms_patra: "आशीर्वाद पत्र",
    ms_completed_sevas: "संपन्न सेवाएँ",
    ms_tagline: "दान पुण्य आपका · सेवा हमारी",
    ms_current: "वर्तमान सदस्यता",
    ms_location: "तीर्थ गुरु पुष्करराज, पुष्कर",
    ms_per_month: "/माह",
    ms_per_year: "/वर्ष",
    ms_next_seva: "अगली सेवा",
    ms_next_billing: "अगला बिलिंग",
    ms_auto_renew: "ऑटो-रिन्यू",
    ms_retry_pay: "Payment Dobara Karein",
    ms_in_membership: "आपकी सदस्यता में",
    ms_whats_included: "क्या-क्या शामिल है",
    ms_video_proof_sub: "हर सेवा का प्रमाण",
    ms_upto_family: "4 परिवारजनों तक",
    ms_patra_each: "हर पूजा पर आशीर्वाद पत्र",
    ms_prasad_box: "Prasad Box घर तक",
    ms_ledger: "पुण्य बही-खाता",
    ms_ledger_desc: "आपके नाम से संपन्न हर सेवा का लेखा — प्रमाण सहित।",
    ms_ledger_empty: "अभी कोई सेवा दर्ज नहीं",
    ms_ledger_empty_active_pre: "आपकी पहली सेवा",
    ms_ledger_empty_active_post: "को होगी — उसका प्रमाण WhatsApp पर एवं यहाँ जुड़ जाएगा।",
    ms_ledger_empty_inactive: "सदस्यता सक्रिय होते ही आपकी सेवाएँ यहाँ दर्ज होने लगेंगी।",
    ms_proof: "प्रमाण",
    ms_preparing: "तैयार हो रहा",
    ms_patra_title: "आशीर्वाद पत्र",
    ms_patra_desc: "हर पूजा के बाद आपके परिवार के नाम से जारी।",
    ms_view: "देखें",
    ms_save: "Save",
    ms_soon: "जल्द ही",
    ms_family: "परिवार संकल्प",
    ms_sankalp_pending: "संकल्प बाकी",
    ms_sankalp_pending_desc:
      "नाम-गोत्र अभी जोड़े नहीं गए। हमारी टीम कॉल करके मदद भी करती है — या आप अभी खुद जोड़ सकते हैं।",
    ms_add_details: "विवरण जोड़ें",
    ms_gotra_unknown: "गोत्र अज्ञात",
    ms_add_members_hi_post: "और सदस्य जोड़ें",
    ms_add_members_en_pre: "Add",
    ms_add_members_en_post: "more",
    ms_prasad_address: "प्रसाद पता",
    ms_address_empty: "अभी नहीं जोड़ा — Premium Annual प्रसाद डिलीवरी के लिए ज़रूरी।",
    ms_complete_profile: "प्रोफ़ाइल पूरी करें",
    ms_login_title: "लॉगिन करें",
    ms_login_desc: "अपना पुण्य बैंक एवं सदस्यता देखने के लिए मोबाइल OTP से लॉगिन करें।",
    ms_login_btn: "लॉगिन",
    ms_empty_title: "आपका पुण्य बैंक खाली है",
    ms_empty_desc:
      "अपनी पहली सेवा शुरू करने के लिए एक सदस्यता चुनें — फिर हर माह का पुण्य यहाँ जुड़ता जाएगा।",
    ms_see_sadasyata: "सदस्यता देखें",

    // Sevas page
    sevas_title: "पुण्यता की सेवाएँ",
    sevas_sub:
      "तीर्थ गुरु पुष्करराज में आपके नाम एवं गोत्र से सम्पन्न होने वाली सभी सेवाएँ — पूर्ण पारदर्शिता और WhatsApp Video Proof के साथ।",
    sevas_err: "सेवा सूची अभी लोड नहीं हो पाई।",
    sevas_err_desc: "Live seva data लाने में समस्या आई। कृपया पुनः प्रयास करें।",

    // Plans page
    plans_sub2:
      "हर पैक में — Pooja + Chadava + Daan + Sewa + Aarti। एक ही सदस्यता में 4 परिवारजनों तक का संकल्प।",
    plans_err_title: "सदस्यता अभी लोड नहीं हो पाई।",
    plans_err_desc: "Live Sadasyata data लाने में समस्या आई। कृपया पुनः प्रयास करें।",
    plans_acharyas: "हमारे आचार्य",
    plans_daan_together: "Daan-Punya एक साथ",
    plans_cta: "पुण्य शुरू करें",

    // Sundarkand Mahatmya section
    sk_kicker: "सुंदरकांड का महात्म्य",
    sk_title: "जहाँ सुंदरकांड, वहाँ संकट का नाश।",
    sk_quote:
      "\"सुंदरकांड का पाठ करने वाले के घर में न दरिद्रता रहती है, न रोग, न शोक, न भय।\"",
    sk_para:
      "श्री राम चरितमानस का सुंदरकांड — एकमात्र ऐसा कांड है जिसमें श्री हनुमान जी ने स्वयं अपने पराक्रम से असंभव को संभव कर दिखाया। यह पाठ साक्षात हनुमान जी का आवाहन है — बिगड़े काम बनते हैं, ग्रह दोष शांत होते हैं, और परिवार में सकारात्मक ऊर्जा का संचार होता है।",
    sk_cost_label: "आज के समय में सुंदरकांड की लागत",
    sk_cost_note: "सामान्य आचार्य शुल्क",
    sk_collective: "सामूहिक संकल्प से",
    sk_your_name: "आपके नाम और गोत्र से",
    sk_closing: "इसलिए श्री हनुमान जी की कृपा से हमने संकल्प लिया — यह पुण्य हर घर तक पहुँचे।",

    // Plan detail page
    pd_err_title: "सदस्यता लोड नहीं हो पाई",
    pd_about: "इस संकल्प के बारे में",
    pd_included: "इस पैक में शामिल सेवाएँ",
    pd_benefits: "इस संकल्प के फायदे",
    pd_reviews: "इस पैक के भक्तों की राय",
    pd_related: "अन्य पैक देखें",
    pd_total: "कुल राशि",

    // FAQ page
    faq_page_title: "आपके प्रश्न",
  },
  english: {
    // Navigation / Header
    nav_home: "Home",
    nav_plans: "Sadasyata",
    nav_sevas: "Our Sevas",
    nav_reviews: "Reviews",
    nav_about: "About Us",
    nav_faq: "FAQ",
    nav_my_subscription: "My Subscription",

    // Trust — 11 years
    trust_years_badge: "11 Years of Trust",
    trust_years_line: "For the past 11 years, Punyata has been in your service — an organized seva, built on your trust.",
    trust_years_footer: "11 Years of Trust · Bharat Ka Punya Bank",

    // Homepage Hero
    hero_badge: "1,200+ Families Connected With Us",
    hero_sub: "Jai Siyaram • From Holy Pushkarraj",
    hero_title_1: "Punya Yours,",
    hero_title_2: "Service Ours.",
    hero_desc:
      "Too busy to perform daan-punya, hawan, or pooja yourself? Punyata fulfills this sacred responsibility in your name & gotra at Holy Pushkarraj — with video proof sent directly to your WhatsApp.",
    hero_cta: "See Sadasyata — Starting from ₹251/Month",

    // Homepage Mission
    mission_relief: "The Relief",
    mission_title: "Don't let a busy life keep you from accumulating Punya.",
    mission_desc:
      "In the rush of city life, every home is drifting away from regular daan-punya, hawan, and pooja. Punyata takes up this sacred duty for you — in your name, your gotra, and with your sankalp.",
    mission_quote: '"We don\'t take away your responsibility — we fulfill it on your behalf."',

    // How It Works
    hiw_title: "How It Works",
    hiw_step: "STEP",
    hiw_step_1_title: "Sankalp",
    hiw_step_1_desc: "Take a monthly sankalp with your name & gotra.",
    hiw_step_2_title: "Seva",
    hiw_step_2_desc: "Your rituals are performed at Holy Pushkarraj.",
    hiw_step_3_title: "Pramaan",
    hiw_step_3_desc: "Video proof of every ritual is sent directly to your WhatsApp.",

    // Proof Gallery
    gallery_title: "Proof Gallery",
    gallery_see_all: "See All →",
    gallery_type: "Video",
    gallery_footer: "Live/Video Proof of every seva sent to your WhatsApp monthly.",

    // Kaliyug Section
    kaliyug_badge: "Daan-Punya in Kaliyug",
    kaliyug_title: "Punya is the only wealth that stays with you.",
    kaliyug_footer:
      "When we cannot perform daan-punya ourselves, Punyata carries out this sacred duty in your name.",

    // Family Section
    family_title: "For the Whole Family",
    family_desc:
      "One subscription — sankalp for up to 4 family members. Every person's name and gotra is spoken during the rituals.",

    // Plans preview
    plans_sub: "Starting at ₹251/Month • Up to 4 family members",
    plans_view_details: "View Details",
    plans_see_full: "See Full Sadasyata",
    plans_footer: "No Hidden Charges · Cancel Anytime · 100% Secure via Razorpay",

    // Punya Meter
    pm_title: "Punya Meter",
    pm_subtitle:
      "Are you able to accumulate Punya for yourself and your family every month with Vedic rituals?",
    pm_badge: "Punya is the only wealth that goes with you after this life",
    pm_ques_parent: "Are you able to perform daan-punya for your parents?",
    pm_ques_1: "Feeding 5 sadhus (Saadhu Santo Ko Bhojan) — with Vedic Sankalp",
    pm_ques_2: "Feeding Gau Mata (Cow Seva) and caring",
    pm_ques_3: "Offering chickpeas/bananas to monkeys for Lord Hanuman (Vanara Seva)",
    pm_ques_4: "Sundarkand path performed according to Vedic rituals",
    pm_ques_5: "Hawan or Daan-Punya according to Vedic vidhi",
    pm_yes: "Yes, I am able to",
    pm_no: "No, I am not able to",
    pm_pass_msg: "Your Punya Bank is healthy",
    pm_fail_msg: "Your Punya Bank is not healthy",
    pm_score: "Score",
    pm_pass_bless:
      "🕉️ Pranam! You are regularly performing punya activities. May Lord Hanuman's grace always be upon you and your family.",
    pm_fail_bless:
      "In Kaliyug, regular daan-punya is our greatest shield. Don't let busyness block your punya journey.",
    pm_cta: "Start Your Punya Journey",
    pm_reset: "Check Punya Meter Again",
    pm_benefits_title: "Benefits of Regular Daan-Punya",
    pm_benefit_1: "Dispelling household discord and Vastu defects",
    pm_benefit_2: "Grace of Lord Hanuman on all family members",
    pm_benefit_3: "Destruction of financial obstacles and poverty",
    pm_benefit_4: "Satisfaction and blessings of ancestors",
    pm_benefit_5: "Positive energy and mental peace in the family",
    pm_benefit_6: "Mitigation of Pitra Dosh and planetary defects",
    pm_benefit_7: "Destruction of fear and crisis by the grace of Lord Hanuman",
    pm_benefit_8: "Continuous flow of direct daan-punya",

    // Checkout
    checkout_back: "Back to Sadasyata",
    checkout_plan_not_found: "Sadasyata not found",
    checkout_back_to_plans: "Back to Sadasyata",
    checkout_load_error_title: "Checkout couldn't load",
    checkout_load_error_desc: "We ran into a problem fetching live Sadasyata data. Please try again.",
    checkout_retry: "Retry",
    checkout_retrying: "Retrying…",
    checkout_your_details: "Your Details",
    checkout_name_label: "Name",
    checkout_name_placeholder: "Your name",
    checkout_phone_label: "Mobile Number",
    checkout_phone_placeholder: "10-digit mobile number",
    checkout_saving: "Saving…",
    checkout_family_note: "Family members' names & gotras are added to your profile after payment.",
    checkout_order_summary: "Order Summary",
    checkout_plan_label: "Sadasyata",
    checkout_amount_label: "Amount",
    checkout_trust_refund_title: "100% Refund",
    checkout_trust_refund_desc: "Full amount back, if eligible",
    checkout_trust_cancel_title: "Cancel Anytime",
    checkout_trust_cancel_desc: "No extra cost, no questions",
    checkout_trust_secure_title: "100% Secure",
    checkout_trust_secure_desc: "Encrypted by Razorpay",
    checkout_terms_confirm: "I confirm that I have read the",
    checkout_terms_tc: "Terms & Conditions",
    checkout_terms_and: "and",
    checkout_terms_refund: "Refund Policy",
    checkout_terms_read: "and I agree to them.",
    checkout_pay_button: "Confirm & Pay",
    checkout_opening_gateway: "Opening Razorpay…",
    checkout_secure_footer: "100% Secure Payment via Razorpay · UPI AutoPay / Card",
    checkout_paid_title: "Payment received!",
    checkout_paid_sub: "Confirming your subscription…",
    checkout_name_required: "Please enter your name",
    checkout_phone_required: "Please enter a valid 10-digit mobile number",
    checkout_identity_save_error: "Couldn't save your details.",
    checkout_gateway_error: "Payment gateway failed to load — check your internet and retry.",
    checkout_keys_error: "Payment keys aren't configured — please try again shortly.",
    checkout_cancelled_msg: "Payment was cancelled — you can try again whenever you're ready.",
    checkout_generic_error: "Couldn't start payment.",

    // Units (composed as `${n} ${unit}`)
    unit_day: "day",
    unit_days: "days",
    unit_month: "month",
    unit_months: "months",

    // Seva cadence labels
    sd_2nd_tuesday: "2nd Tuesday",
    sd_last_saturday: "Last Saturday",

    // Member cue (header / nav)
    member_badge: "Member",

    // Subscriber banner (home)
    b_active: "Membership Active",
    b_just_joined: "Just joined",
    b_active_since: "months active",
    b_greeting: "Jai Siyaram,",
    b_ji: "ji",
    b_your: "Your",
    b_seva_active: "seva is active",
    b_next_seva: "Next Seva",
    b_per_month: "Every month",
    b_your_name: "in your name",
    b_included: "Included",
    b_cta: "View My Subscription",

    // Shared subscription words
    s_active: "Active",
    s_today: "Today",
    s_sevas: "sevas",
    s_video_proof: "WhatsApp Video Proof",

    // My Subscription — Punya Bank
    ms_punya_bank: "Your Punya Bank",
    ms_joined: "Joined",
    ms_sevas_done: "Sevas Completed",
    ms_in_name_gotra: "In your name & gotra",
    ms_journey: "Your seva journey begins 🪔",
    ms_first_seva: "First seva",
    ms_confirm_wait: "Your first seva begins the moment your membership is confirmed.",
    ms_active_membership: "Active Membership",
    ms_new: "New",
    ms_patra: "Ashirwad Patra",
    ms_completed_sevas: "Completed Sevas",
    ms_tagline: "Your daan-punya · our seva",
    ms_current: "Current Membership",
    ms_location: "Tirth Guru Pushkarraj, Pushkar",
    ms_per_month: "/month",
    ms_per_year: "/year",
    ms_next_seva: "Next Seva",
    ms_next_billing: "Next Billing",
    ms_auto_renew: "Auto-renew",
    ms_retry_pay: "Retry Payment",
    ms_in_membership: "In your membership",
    ms_whats_included: "What's included",
    ms_video_proof_sub: "Proof of every seva",
    ms_upto_family: "Up to 4 family members",
    ms_patra_each: "Ashirwad Patra every pooja",
    ms_prasad_box: "Prasad Box to your door",
    ms_ledger: "Punya Ledger",
    ms_ledger_desc: "A record of every seva done in your name — with proof.",
    ms_ledger_empty: "No sevas recorded yet",
    ms_ledger_empty_active_pre: "Your first seva is on",
    ms_ledger_empty_active_post: "— its proof will arrive on WhatsApp and here.",
    ms_ledger_empty_inactive: "Your sevas will start appearing here once your membership is active.",
    ms_proof: "Proof",
    ms_preparing: "Preparing",
    ms_patra_title: "Ashirwad Patra",
    ms_patra_desc: "Issued in your family's name after every pooja.",
    ms_view: "View",
    ms_save: "Save",
    ms_soon: "Soon",
    ms_family: "Family Sankalp",
    ms_sankalp_pending: "Sankalp Pending",
    ms_sankalp_pending_desc:
      "Names & gotras aren't added yet. Our team can help you over a call — or you can add them yourself now.",
    ms_add_details: "Add Details",
    ms_gotra_unknown: "Gotra unknown",
    ms_add_members_hi_post: "aur sadasya jodein",
    ms_add_members_en_pre: "Add",
    ms_add_members_en_post: "more",
    ms_prasad_address: "Prasad Address",
    ms_address_empty: "Not added yet — required for Premium Annual prasad delivery.",
    ms_complete_profile: "Complete Profile",
    ms_login_title: "Login",
    ms_login_desc: "Login with a mobile OTP to see your Punya Bank and membership.",
    ms_login_btn: "Login",
    ms_empty_title: "Your Punya Bank is empty",
    ms_empty_desc:
      "Choose a membership to begin your first seva — then each month's punya accumulates here.",
    ms_see_sadasyata: "See Sadasyata",

    // Sevas page
    sevas_title: "Punyata's Sevas",
    sevas_sub:
      "Every seva performed in your name & gotra at Tirth Guru Pushkarraj — with full transparency and WhatsApp video proof.",
    sevas_err: "The seva list couldn't load.",
    sevas_err_desc: "We ran into a problem fetching live seva data. Please try again.",

    // Plans page
    plans_sub2:
      "Every pack — Pooja + Chadava + Daan + Sewa + Aarti. One membership, sankalp for up to 4 family members.",
    plans_err_title: "Sadasyata couldn't load.",
    plans_err_desc: "We ran into a problem fetching live Sadasyata data. Please try again.",
    plans_acharyas: "Our Acharyas",
    plans_daan_together: "Daan-Punya together",
    plans_cta: "Start Your Punya",

    // Sundarkand Mahatmya section
    sk_kicker: "The Glory of Sundarkand",
    sk_title: "Where there is Sundarkand, troubles are destroyed.",
    sk_quote:
      "\"In the home of one who recites Sundarkand, there is no poverty, no illness, no grief, and no fear.\"",
    sk_para:
      "The Sundarkand of Shri Ram Charitmanas is the one chapter where Shri Hanuman ji, by his own might, made the impossible possible. Its recitation is a direct invocation of Hanuman ji — stalled work moves forward, planetary afflictions are calmed, and positive energy flows through the family.",
    sk_cost_label: "Cost of a Sundarkand today",
    sk_cost_note: "Typical acharya fee",
    sk_collective: "Through collective sankalp",
    sk_your_name: "In your name & gotra",
    sk_closing:
      "So by the grace of Shri Hanuman ji we took a sankalp — that this punya reaches every home.",

    // Plan detail page
    pd_err_title: "Sadasyata couldn't load",
    pd_about: "About this Sankalp",
    pd_included: "Sevas Included in this Pack",
    pd_benefits: "Benefits of this Sankalp",
    pd_reviews: "What Devotees Say",
    pd_related: "See Other Packs",
    pd_total: "Total",

    // FAQ page
    faq_page_title: "Your Questions",
  },
} as const;

/**
 * Pick a DB-backed display name for the current language. Plan and seva
 * names live in the DB (Devanagari ritual names); an optional `name_en`
 * column supplies an English rendering. Falls back to the default name
 * whenever the English one is missing, so untranslated rows still show.
 */
export function localizedName(name: string, nameEn: string | null | undefined, lang: Lang): string {
  return lang === "english" && nameEn?.trim() ? nameEn.trim() : name;
}

export function useLanguage() {
  // [Pass-2 L8] Hydration-safe: the SSR pass and the first client
  // render must agree (both "hindi"); a stored preference is applied
  // in an EFFECT after mount. The old localStorage-in-initializer made
  // english-preferring browsers hydrate with different text than the
  // server rendered — React hydration mismatch + full re-render flash
  // on every marketing page.
  const [lang, setLang] = useState<Lang>("hindi");

  useEffect(() => {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored === "hindi" || stored === "english") {
      setLang((prev) => (prev === stored ? prev : stored));
    }
    const handleLangChange = (e: Event) => {
      const customEvent = e as CustomEvent<Lang>;
      setLang(customEvent.detail);
    };
    window.addEventListener("punyata:lang-change", handleLangChange);
    return () => window.removeEventListener("punyata:lang-change", handleLangChange);
  }, []);

  return lang;
}

export function useTranslation() {
  const lang = useLanguage();
  const t = (key: keyof typeof translations.hindi) => {
    return translations[lang][key] || translations.hindi[key] || key;
  };
  return { t, lang };
}
