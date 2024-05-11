import HeaderBox from "@/components/HeaderBox";
import RightSideBar from "@/components/RightSideBar";
import TotalBalanceBox from "@/components/TotalBalanceBox";
import React from "react";

const Home = () => {
  const loggedIn = { firstName: "Kaloyan", lastName:'Hristov', email:'kaloyan@23.com' };
  return (
    <section className="home">
      <div className="home-content">
        <header className="home-header">
          <HeaderBox
            type="greeting"
            title="Welcome"
            user={loggedIn?.firstName || "Guest"}
            subtext="Access and manage your account and transaction efficiently."
          />

          <TotalBalanceBox accounts={[]} totalBanks={1} totalCurrentBalance={1250.35}/>
        </header>

        Recent transaction
       
      </div>
      <RightSideBar user={loggedIn} transactions={[]} banks={[{currentBalance: 123.50},{ currentBalance: 500.50}]}/>
    </section>
  );
};

export default Home;
