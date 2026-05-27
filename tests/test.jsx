import React from 'react';
import { FaEnvelope } from "react-icons/fa";
function Test() {
  return <div style={{
    width: "min-content",
    height: 43.2,
    backgroundColor: "#cf02a9",
    paddingLeft: 21,
    paddingTop: 12,
    paddingRight: 19,
    paddingBottom: 13,
    borderRadius: 10,
    borderWidth: 1,
    padding: "12px 19px 13px 21px",
    marginLeft: 0,
    position: "relative",
    left: "",
    marginTop: 0,
    top: "",
    display: "flex",
    justifyContent: "space-between",
    flexDirection: "row"
  }}>
      <h1 style={{
      width: "min-content",
      marginLeft: 0,
      position: "relative",
      left: "",
      marginTop: 0,
      top: "",
      height: 42.4
    }}>Test<FaEnvelope />
      <FaEnvelope />
    </h1>
    
      <div></div>
    </div>;
}
export default Test;
