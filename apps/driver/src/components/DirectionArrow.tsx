import React from "react";
import { View } from "react-native";
import Svg, { Path } from "react-native-svg";

interface Props {
  heading: number;
  size?: number;
}

export function DirectionArrow({ heading, size = 40 }: Props) {
  return (
    <View style={{ transform: [{ rotate: `${heading}deg` }] }}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
          d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"
          fill="#f97316"
        />
      </Svg>
    </View>
  );
}
