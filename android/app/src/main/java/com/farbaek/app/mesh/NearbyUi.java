package com.farbaek.app.mesh;

import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
import android.annotation.SuppressLint;
import android.content.Context;
import android.content.res.AssetManager;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ClipDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.LayerDrawable;
import android.graphics.drawable.RippleDrawable;
import android.os.Build;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.animation.DecelerateInterpolator;
import android.view.animation.LinearInterpolator;
import android.view.animation.OvershootInterpolator;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import com.farbaek.app.R;

/**
 * The Nearby screen's parts, drawn in the web app's own system (White Signal, ADR 0008), so the native screen reads
 * as the same product as the pages around it: Geist and Geist Mono, one accent, pill buttons, 20dp cards, 12dp
 * inputs, Phosphor icons (outlined for things, bold in buttons, filled for states), and status as words with their
 * icon, colour and border together, never colour alone (ADR 0183).
 */
final class NearbyUi {
    /** Where something stands: the web's StatusBadge kinds that Nearby uses, each with its icon and colour. */
    enum Kind {
        VERIFIED(R.drawable.ph_check_circle_fill, R.color.verified, true),
        DONE(R.drawable.ph_check_circle_fill, R.color.ink_2, false),
        APPROVAL(R.drawable.ph_clock_user_fill, R.color.approval, true),
        PENDING(R.drawable.ph_clock_fill, R.color.info, false),
        WORKING(R.drawable.ph_circle_notch_bold, R.color.info, false),
        ATTENTION(R.drawable.ph_warning_circle_fill, R.color.caution, false),
        FAILED(R.drawable.ph_x_circle_fill, R.color.failed, true),
        OFF(R.drawable.ph_minus_circle_fill, R.color.ink_3, false),
        INFO(R.drawable.ph_info_fill, R.color.info, false);

        final int icon;
        final int color;
        /** Whether the badge has a faint fill of its colour, as the web's verified, approval and failed do. */
        final boolean tinted;

        Kind(int icon, int color, boolean tinted) {
            this.icon = icon;
            this.color = color;
            this.tinted = tinted;
        }
    }

    private static Typeface sans;
    private static Typeface sansMedium;
    private static Typeface mono;
    private static Typeface monoMedium;

    private final Context c;
    private final float dp;

    NearbyUi(Context context) {
        c = context;
        dp = context.getResources().getDisplayMetrics().density;
        if (sans == null) {
            AssetManager assets = context.getAssets();
            sans = font(assets, "fonts/geist.ttf", 400, "sans-serif");
            sansMedium = font(assets, "fonts/geist.ttf", 500, "sans-serif-medium");
            mono = font(assets, "fonts/geist-mono.ttf", 400, "monospace");
            monoMedium = font(assets, "fonts/geist-mono.ttf", 500, "monospace");
        }
    }

    /**
     * Geist at one weight of its variable axis (Android 8 and later). Before that, or if the file can't be read, the
     * system's sans-serif, so words always show.
     */
    private static Typeface font(AssetManager assets, String path, int weight, String fallback) {
        if (Build.VERSION.SDK_INT >= 26) {
            try {
                Typeface t = new Typeface.Builder(assets, path).setFontVariationSettings("'wght' " + weight).setWeight(weight).setFallback(fallback).build();
                if (t != null) return t;
            } catch (RuntimeException ignored) {
                // A font the system can't read: the fallback below.
            }
        }
        return Typeface.create(fallback, Typeface.NORMAL);
    }

    int px(float dps) {
        return Math.round(dps * dp);
    }

    int color(int res) {
        return c.getColor(res);
    }

    /** A colour at an opacity, over white: how the web's `bg-verified/[0.05]` and `border-verified/35` look. */
    int over(int res, float alpha) {
        int v = color(res);
        int r = Math.round(255 + (Color.red(v) - 255) * alpha);
        int g = Math.round(255 + (Color.green(v) - 255) * alpha);
        int b = Math.round(255 + (Color.blue(v) - 255) * alpha);
        return Color.rgb(r, g, b);
    }

    // Type: four sizes on the screen (30 title, 18 section, 16 names and buttons, 15 body), 13 for captions.

    TextView text(CharSequence s, float sp, boolean medium, int colorRes) {
        TextView t = new TextView(c);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color(colorRes));
        t.setTypeface(medium ? sansMedium : sans);
        t.setIncludeFontPadding(false);
        t.setLineSpacing(0, sp >= 24 ? 1.08f : sp >= 17 ? 1.25f : 1.4f);
        if (sp >= 24) t.setLetterSpacing(-0.03f);
        else if (sp >= 17) t.setLetterSpacing(-0.01f);
        return t;
    }

    TextView body(CharSequence s) {
        return text(s, 15, false, R.color.ink_2);
    }

    TextView caption(CharSequence s) {
        return text(s, 13, false, R.color.ink_3);
    }

    /** For what people copy or compare, such as a key or an address: Geist Mono, never words. */
    TextView mono(CharSequence s, float sp, int colorRes) {
        TextView t = text(s, sp, false, colorRes);
        t.setTypeface(mono);
        t.setLetterSpacing(0);
        return t;
    }

    /** Geist Mono, for an input where people type an address. */
    Typeface monoTypeface() {
        return mono;
    }

    /** A section heading, as the web app's CardTitle: a 20dp outlined icon in the quiet ink, then the words. */
    LinearLayout title(int iconRes, String words) {
        LinearLayout row = row();
        row.addView(icon(iconRes, 20, R.color.ink_3), new LinearLayout.LayoutParams(px(20), px(20)));
        TextView t = text(words, 18, true, R.color.ink);
        if (Build.VERSION.SDK_INT >= 28) t.setAccessibilityHeading(true);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
        lp.leftMargin = px(10);
        row.addView(t, lp);
        return row;
    }

    ImageView icon(int res, int sizeDp, int colorRes) {
        ImageView i = new ImageView(c);
        i.setImageResource(res);
        i.setImageTintList(ColorStateList.valueOf(color(colorRes)));
        i.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        i.setLayoutParams(new LinearLayout.LayoutParams(px(sizeDp), px(sizeDp)));
        return i;
    }

    LinearLayout column() {
        LinearLayout l = new LinearLayout(c);
        l.setOrientation(LinearLayout.VERTICAL);
        return l;
    }

    LinearLayout row() {
        LinearLayout l = new LinearLayout(c);
        l.setOrientation(LinearLayout.HORIZONTAL);
        l.setGravity(Gravity.CENTER_VERTICAL);
        return l;
    }

    /** A card: white, 20dp corners, a hairline border and a faint shadow tinted with the ink, never grey. */
    LinearLayout card() {
        LinearLayout card = column();
        card.setBackground(rounded(R.color.surface, 20, R.color.line, 1));
        card.setPadding(px(20), px(20), px(20), px(20));
        card.setElevation(px(1));
        if (Build.VERSION.SDK_INT >= 28) {
            card.setOutlineSpotShadowColor(Color.argb(40, 18, 19, 23));
            card.setOutlineAmbientShadowColor(Color.argb(24, 18, 19, 23));
        }
        top(card, 16);
        return card;
    }

    /** The card for your turn (a pairing code to check, a file to accept): the accent's border, as on the web. */
    LinearLayout turnCard() {
        LinearLayout card = card();
        card.setBackground(rounded(R.color.surface, 20, R.color.accent, 1.5f));
        return card;
    }

    GradientDrawable rounded(int fillRes, float radiusDp, int strokeRes, float strokeDp) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(fillRes == 0 ? Color.TRANSPARENT : color(fillRes));
        g.setCornerRadius(px(radiusDp));
        if (strokeRes != 0) g.setStroke(Math.max(1, px(strokeDp)), color(strokeRes));
        return g;
    }

    /** A thin line between parts of one card. */
    View divider() {
        View v = new View(c);
        v.setBackgroundColor(color(R.color.line));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Math.max(1, px(1)));
        lp.topMargin = px(16);
        v.setLayoutParams(lp);
        return v;
    }

    /** Where something stands: its icon, words, colour and border together (ADR 0183). */
    View badge(Kind kind, String words) {
        LinearLayout b = row();
        int tone = color(kind.color);
        GradientDrawable shape = new GradientDrawable();
        shape.setCornerRadius(px(999));
        shape.setColor(kind.tinted ? over(kind.color, 0.06f) : color(R.color.surface));
        if (kind == Kind.OFF) shape.setStroke(Math.max(1, px(1)), color(R.color.line_2), px(3), px(2));
        else shape.setStroke(Math.max(1, px(1)), kind == Kind.DONE ? color(R.color.line_2) : over(kind.color, 0.35f));
        b.setBackground(shape);
        b.setPadding(px(10), 0, px(12), 0);
        b.setMinimumHeight(px(28));
        ImageView i = icon(kind.icon, 14, kind.color);
        b.addView(i);
        if (kind == Kind.WORKING) {
            ObjectAnimator spin = ObjectAnimator.ofFloat(i, View.ROTATION, 0f, 360f);
            spin.setDuration(900);
            spin.setRepeatCount(ValueAnimator.INFINITE);
            spin.setInterpolator(new LinearInterpolator());
            i.addOnAttachStateChangeListener(new View.OnAttachStateChangeListener() {
                @Override
                public void onViewAttachedToWindow(View v) {
                    if (motion()) spin.start();
                }

                @Override
                public void onViewDetachedFromWindow(View v) {
                    spin.cancel();
                }
            });
        }
        TextView t = text(words, 13, true, kind.color);
        t.setTextColor(tone);
        t.setSingleLine(true);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.leftMargin = px(6);
        b.addView(t, lp);
        LinearLayout.LayoutParams outer = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        b.setLayoutParams(outer);
        return b;
    }

    // Buttons: pills that answer the finger at once (a slight press-in), 48dp tall or more, with what they do in words.

    static final int PRIMARY = 0;
    static final int SECONDARY = 1;
    static final int QUIET = 2;

    /** A pill button: its icon (bold, 18dp) beside its words, centred, so the pair stays together at any width. */
    @SuppressLint("ClickableViewAccessibility")
    LinearLayout button(String label, int iconRes, int style) {
        LinearLayout b = row();
        b.setGravity(Gravity.CENTER);
        b.setMinimumHeight(px(style == QUIET ? 44 : 52));
        b.setPadding(px(style == QUIET ? 12 : 22), px(10), px(style == QUIET ? 12 : 22), px(10));
        int fg = style == PRIMARY ? R.color.on_primary : style == QUIET ? R.color.ink_2 : R.color.ink;
        GradientDrawable shape = style == PRIMARY ? rounded(R.color.primary, 999, 0, 0)
                : style == SECONDARY ? rounded(R.color.surface, 999, R.color.line_2, 1)
                : rounded(0, 999, 0, 0);
        GradientDrawable mask = rounded(R.color.ink, 999, 0, 0);
        int ripple = style == PRIMARY ? Color.argb(56, 255, 255, 255) : Color.argb(20, 18, 19, 23);
        b.setBackground(new RippleDrawable(ColorStateList.valueOf(ripple), shape, mask));
        if (iconRes != 0) b.addView(icon(iconRes, 18, fg), new LinearLayout.LayoutParams(px(18), px(18)));
        TextView t = text(label, 16, true, fg);
        t.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        if (iconRes != 0) lp.leftMargin = px(8);
        b.addView(t, lp);
        b.setClickable(true);
        b.setFocusable(true);
        b.setContentDescription(label);
        b.setAccessibilityDelegate(new View.AccessibilityDelegate() {
            @Override
            public void onInitializeAccessibilityNodeInfo(View host, AccessibilityNodeInfo info) {
                super.onInitializeAccessibilityNodeInfo(host, info);
                info.setClassName(Button.class.getName());
            }
        });
        // The press-in: 97% while the finger is down, back on release. It never takes the touch from the click.
        b.setOnTouchListener((v, e) -> {
            int action = e.getActionMasked();
            if (action == MotionEvent.ACTION_DOWN && v.isEnabled()) v.animate().scaleX(0.97f).scaleY(0.97f).setDuration(90).start();
            else if (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL) v.animate().scaleX(1f).scaleY(1f).setDuration(160).start();
            return false;
        });
        return b;
    }

    /** Turns a button off, visibly: it fades, and its words stay readable. */
    static void enable(View button, boolean on) {
        button.setEnabled(on);
        button.setAlpha(on ? 1f : 0.42f);
    }

    /** Buttons one above the other, full width: the first is the one to press. For a decision, and on narrow phones. */
    LinearLayout stack(View... buttons) {
        LinearLayout l = column();
        for (int i = 0; i < buttons.length; i++) {
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.topMargin = i == 0 ? 0 : px(8);
            l.addView(buttons[i], lp);
        }
        top(l, 16);
        return l;
    }

    /** Two buttons side by side, sharing the width. */
    LinearLayout pair(View first, View second) {
        LinearLayout l = row();
        LinearLayout.LayoutParams a = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
        LinearLayout.LayoutParams b = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
        b.leftMargin = px(8);
        l.addView(first, a);
        l.addView(second, b);
        top(l, 16);
        return l;
    }

    /** A progress bar: a 6dp pill of the accent on a quiet track. Moves smoothly to each new value. */
    ProgressBar progress(long done, long total, String description) {
        ProgressBar bar = new ProgressBar(c, null, android.R.attr.progressBarStyleHorizontal);
        GradientDrawable track = rounded(R.color.surface_sunken, 999, 0, 0);
        GradientDrawable fill = rounded(R.color.accent, 999, 0, 0);
        LayerDrawable layers = new LayerDrawable(new Drawable[] {track, new ClipDrawable(fill, Gravity.START, ClipDrawable.HORIZONTAL)});
        layers.setId(0, android.R.id.background);
        layers.setId(1, android.R.id.progress);
        bar.setProgressDrawable(layers);
        bar.setMax(1000);
        bar.setProgress((int) Math.min(1000, done * 1000 / Math.max(1, total)));
        bar.setContentDescription(description);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, px(6));
        lp.topMargin = px(14);
        bar.setLayoutParams(lp);
        return bar;
    }

    /** The six digits to compare, in two groups of three, each on a quiet tile, in Geist Mono. */
    LinearLayout code(String digits) {
        LinearLayout l = row();
        String safe = digits != null && digits.length() == 6 ? digits : "------";
        for (int g = 0; g < 2; g++) {
            TextView t = mono(safe.substring(g * 3, g * 3 + 3), 34, R.color.ink);
            t.setTypeface(monoMedium);
            t.setLetterSpacing(0.14f);
            t.setGravity(Gravity.CENTER);
            t.setBackground(rounded(R.color.canvas_2, 12, R.color.line, 1));
            t.setPadding(px(14), px(10), px(10), px(10));
            t.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            if (g == 1) lp.leftMargin = px(10);
            l.addView(t, lp);
        }
        l.setContentDescription("Code " + safe.replace("", " ").trim());
        l.setFocusable(true);
        top(l, 16);
        return l;
    }

    // Motion: only for something new, once, and gone when the person turns animations off (Android's own setting).

    /** False when the person has turned animations off (Remove animations, or animator scale 0). */
    static boolean motion() {
        return Build.VERSION.SDK_INT < 26 || ValueAnimator.areAnimatorsEnabled();
    }

    /** A card that has just appeared rises in: 12dp and a fade, 240ms, slowing as it lands. */
    static void riseIn(View v, float dp) {
        if (!motion()) return;
        v.setAlpha(0f);
        v.setTranslationY(12 * dp);
        v.animate().alpha(1f).translationY(0f).setDuration(240).setInterpolator(new DecelerateInterpolator(2f)).start();
    }

    /** The moment it worked: the check grows in with a small overshoot. */
    static void pop(View v) {
        if (!motion()) return;
        v.setScaleX(0.6f);
        v.setScaleY(0.6f);
        v.setAlpha(0f);
        v.animate().scaleX(1f).scaleY(1f).alpha(1f).setDuration(320).setInterpolator(new OvershootInterpolator(2.2f)).start();
    }

    static void top(View v, int topDp) {
        float density = v.getResources().getDisplayMetrics().density;
        ViewGroup.LayoutParams current = v.getLayoutParams();
        LinearLayout.LayoutParams lp = current instanceof LinearLayout.LayoutParams ? (LinearLayout.LayoutParams) current
                : new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = Math.round(topDp * density);
        v.setLayoutParams(lp);
    }
}
