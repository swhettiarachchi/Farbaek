package com.farbaek.app;

import com.google.androidbrowserhelper.playbilling.digitalgoods.DigitalGoodsRequestHandler;

/**
 * The Trusted Web Activity's service, with Google Play's billing (ADR 0154):
 * the website's Digital Goods API calls (prices, purchases) reach Google Play
 * through it, the way androidbrowserhelper's twa-play-billing demo does.
 */
public class DelegationService extends com.google.androidbrowserhelper.trusted.DelegationService {
    @Override
    public void onCreate() {
        super.onCreate();
        registerExtraCommandHandler(new DigitalGoodsRequestHandler(getApplicationContext()));
    }
}
