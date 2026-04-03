# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Agora RTC / Chat (prevent R8 from stripping native bridge classes used in release)
-keep class io.agora.** { *; }
-keep class com.chatsdk.** { *; }
-keep class io.agora.rtc.ng.react.** { *; }
-keep class com.facebook.react.viewmanagers.AgoraRtc** { *; }
-keep class com.facebook.react.viewmanagers.*Chat* { *; }
-keep class io.agora.rtc2.** { *; }
-dontwarn io.agora.**
-dontwarn com.chatsdk.**

# Add any project specific keep options here:
