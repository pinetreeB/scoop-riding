import { useRef, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  type ScrollViewProps,
  type KeyboardAvoidingViewProps,
} from "react-native";

export interface KeyboardAvoidingScrollViewProps extends ScrollViewProps {
  /**
   * Children to render inside the scroll view
   */
  children: ReactNode;
  /**
   * KeyboardAvoidingView behavior. Defaults to "padding" on iOS, "height" on Android.
   */
  keyboardBehavior?: KeyboardAvoidingViewProps["behavior"];
  /**
   * Additional offset for the keyboard avoiding view
   */
  keyboardVerticalOffset?: number;
  /**
   * Whether to enable keyboard avoiding. Defaults to true.
   */
  enableKeyboardAvoiding?: boolean;
}

/**
 * A ScrollView wrapped with KeyboardAvoidingView for proper keyboard handling.
 * Use this component for any screen with text inputs to prevent keyboard from covering inputs.
 *
 * Usage:
 * ```tsx
 * <KeyboardAvoidingScrollView>
 *   <TextInput placeholder="Name" />
 *   <TextInput placeholder="Email" />
 * </KeyboardAvoidingScrollView>
 * ```
 */
export function KeyboardAvoidingScrollView({
  children,
  keyboardBehavior,
  keyboardVerticalOffset = 0,
  enableKeyboardAvoiding = true,
  contentContainerStyle,
  ...scrollViewProps
}: KeyboardAvoidingScrollViewProps) {
  const scrollViewRef = useRef<ScrollView>(null);

  const behavior = keyboardBehavior ?? (Platform.OS === "ios" ? "padding" : "height");

  if (!enableKeyboardAvoiding) {
    return (
      <ScrollView
        ref={scrollViewRef}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[{ flexGrow: 1 }, contentContainerStyle]}
        {...scrollViewProps}
      >
        {children}
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={behavior}
      keyboardVerticalOffset={keyboardVerticalOffset}
      style={{ flex: 1 }}
    >
      <ScrollView
        ref={scrollViewRef}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[{ flexGrow: 1 }, contentContainerStyle]}
        {...scrollViewProps}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
