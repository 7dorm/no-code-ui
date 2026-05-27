import React from 'react';
import './styles1/landing-soft.css';
import asset_10898084 from "../10898084.png";
import { IoMenu } from "react-icons/io5";
function Aa() {
  return <div style={{
    width: "100%",
    height: "100%",
    position: "relative",
    marginLeft: 2,
    left: ""
  }}>
  
    <div style={{
      width: "auto",
      height: 37,
      backgroundColor: "#3f7850",
      position: "relative",
      left: "",
      top: "",
      marginLeft: 0,
      marginTop: 0,
      paddingLeft: 16,
      paddingTop: 12,
      paddingRight: 18,
      paddingBottom: 13,
      padding: "7px 15px 8px 11px",
      display: "flex",
      justifyContent: "space-between"
    }}>
    
      <div style={{
        height: "auto",
        position: "relative",
        left: "",
        top: "",
        marginLeft: 0,
        marginTop: 0,
        width: "fit-content",
        color: "#ffffff",
        paddingBottom: 0,
        justifyContent: "space-between",
        fontSize: 20
      }}>Cats</div>
    
      <button>
      
        <IoMenu />
      </button>
    </div>
  
    <img src={asset_10898084} alt="" style={{
      width: 356,
      height: 305,
      position: "relative",
      marginLeft: "",
      marginTop: "",
      marginRight: 0,
      marginBottom: 0,
      left: "50%",
      top: "0%",
      transform: "translate(-50%, 0%)"
    }} />
  </div>;
}
export default Aa;
